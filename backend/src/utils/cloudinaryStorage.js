import cloudinary from '../config/cloudinary.js';
import logger from '../config/logger.js';

// publicId is always the FULL path (e.g. "emp-mgmt/production/users/<id>/profile-picture")
// - passed alone, never combined with a separate `folder` option, since
// Cloudinary's folder+public_id combination rules vary by whether
// public_id itself already contains slashes. One unambiguous full path
// avoids that entirely.
// Returns Cloudinary's OWN classification of the upload (result.resource_type),
// not just an echo of what was requested - when resourceType: 'auto' is
// used, Cloudinary decides the real type from the content (e.g. a PDF
// becomes "raw", a real image stays "image"), and that decision - not our
// request - is what deleteAsset() needs later to actually find the asset.
const uploadBuffer = (
  buffer,
  { publicId, resourceType = 'auto', overwrite = false, invalidate = false },
) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { public_id: publicId, resource_type: resourceType, overwrite, invalidate },
      (error, result) => {
        if (error) return reject(error);
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          resourceType: result.resource_type,
        });
      },
    );
    stream.end(buffer);
  });
};

// Best-effort only: called after the owning database transaction has
// already committed, so this asset is by definition no longer referenced
// by anything. A failure here leaves a harmless orphan in Cloudinary
// (see the Cloudinary Consistency Model in the Feature 12 planning doc) -
// it must never throw and block the response the client already
// effectively received.
//
// resourceType is REQUIRED, not defaulted - cloudinary.uploader.destroy()
// defaults to resource_type "image" and silently no-ops (returns
// {result: "not found"}, not a thrown error) for any asset of a different
// type. This was a real bug caught live: deleting a PDF document
// (uploaded as "raw") appeared to succeed but never actually removed the
// Cloudinary asset, because the delete call never said which type to look
// for. Passing the exact type recorded at upload time is what fixes it.
//
// invalidate: true is also required, not implied - without it, destroy()
// removes the asset from Cloudinary's origin storage (confirmed via the
// Admin API) but the CDN can keep serving a stale cached copy at the old
// URL for a while afterward. Also caught live: the origin delete was
// correct, but re-fetching the delivery URL immediately after still
// returned 200 until this was added.
const deleteAsset = async (publicId, resourceType, context = {}) => {
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true });
  } catch (error) {
    logger.warn(`Failed to delete orphaned Cloudinary asset ${publicId}`, {
      ...context,
      error: error.message,
    });
  }
};

export default { uploadBuffer, deleteAsset };
