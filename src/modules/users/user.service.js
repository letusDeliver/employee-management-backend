import prisma from '../../config/database.js';
import env from '../../config/env.js';
import userRepository from './user.repository.js';
import rbacRepository from '../rbac/rbac.repository.js';
import auditLogRepository from '../audit/auditLog.repository.js';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES } from '../audit/auditLog.constants.js';
import cloudinaryStorage from '../../utils/cloudinaryStorage.js';
import NotFoundError from '../../errors/NotFoundError.js';
import BadRequestError from '../../errors/BadRequestError.js';

export const sanitizeUser = (user, roles = []) => {
  const { password, ...safeUser } = user;
  return { ...safeUser, roles };
};

const listUsers = async () => {
  const users = await userRepository.findAll();
  const roleNamesByUserId = await rbacRepository.getRoleNamesForUsers(users.map((user) => user.id));

  return users.map((user) => sanitizeUser(user, roleNamesByUserId.get(user.id) ?? []));
};

// A fixed, deterministic public_id (not a fresh one per upload) combined
// with overwrite+invalidate means a replacement upload replaces the same
// Cloudinary asset in place - there is no separate "old asset" to look up
// and delete for this flow at all (see the Feature 12 planning doc's
// Cloudinary Consistency Model).
const buildProfilePicturePublicId = (userId) =>
  `emp-mgmt/${env.NODE_ENV}/users/${userId}/profile-picture`;

const uploadProfilePicture = async (userId, file, actor) => {
  if (!file) {
    throw new BadRequestError('A file is required');
  }

  const existingUser = await userRepository.findById(userId);

  if (!existingUser) {
    throw new NotFoundError('User not found');
  }

  // Cloudinary upload happens before any database write - if it fails,
  // nothing has touched the database yet.
  const { url, publicId } = await cloudinaryStorage.uploadBuffer(file.buffer, {
    publicId: buildProfilePicturePublicId(userId),
    resourceType: 'image',
    overwrite: true,
    invalidate: true,
  });

  return prisma.$transaction(async (tx) => {
    const updatedUser = await userRepository.updateProfileImage(userId, { url, publicId }, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: AUDIT_ENTITY_TYPES.USER,
        entityId: userId,
        // sanitizeUser() strips password - never store a raw User record
        // here, unlike Employee, User has a field that must never appear
        // in an audit snapshot.
        beforeData: sanitizeUser(existingUser),
        afterData: sanitizeUser(updatedUser),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    const roles = await rbacRepository.getRoleNamesForUser(userId);
    return sanitizeUser(updatedUser, roles);
  });
};

const deleteProfilePicture = async (userId, actor) => {
  const existingUser = await userRepository.findById(userId);

  if (!existingUser) {
    throw new NotFoundError('User not found');
  }

  if (!existingUser.profileImagePublicId) {
    throw new NotFoundError('No profile picture to delete');
  }

  const { profileImagePublicId } = existingUser;

  const updatedUser = await prisma.$transaction(async (tx) => {
    const user = await userRepository.clearProfileImage(userId, tx);

    await auditLogRepository.create(
      {
        actorId: actor.id,
        action: AUDIT_ACTIONS.UPDATE,
        entityType: AUDIT_ENTITY_TYPES.USER,
        entityId: userId,
        beforeData: sanitizeUser(existingUser),
        afterData: sanitizeUser(user),
        ipAddress: actor.ipAddress ?? null,
      },
      tx,
    );

    return user;
  });

  // Runs only after the transaction above has committed - the database is
  // already consistent regardless of whether this cleanup call succeeds.
  // Always 'image' here - profile pictures are only ever uploaded with
  // resourceType: 'image' (see uploadProfilePicture above), never 'auto'.
  await cloudinaryStorage.deleteAsset(profileImagePublicId, 'image', {
    entityType: AUDIT_ENTITY_TYPES.USER,
    entityId: userId,
  });

  const roles = await rbacRepository.getRoleNamesForUser(userId);
  return sanitizeUser(updatedUser, roles);
};

export default { listUsers, uploadProfilePicture, deleteProfilePicture };
