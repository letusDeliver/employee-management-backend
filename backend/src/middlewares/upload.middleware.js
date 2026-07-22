import multer from 'multer';

import BadRequestError from '../errors/BadRequestError.js';

// fileFilter can reject with our own typed error directly - Multer passes
// it through to Express's error chain unmangled (verified in a scratch
// script), so a bad MIME type gets a specific, clear message instead of
// being forced through Multer's own generic LIMIT_UNEXPECTED_FILE code.
const createUploadMiddleware = ({ allowedMimeTypes, maxSizeBytes }) => {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxSizeBytes },
    fileFilter: (req, file, cb) => {
      if (!allowedMimeTypes.includes(file.mimetype)) {
        return cb(
          new BadRequestError(
            `file: must be one of ${allowedMimeTypes.join(', ')} (received ${file.mimetype})`,
          ),
        );
      }

      cb(null, true);
    },
  });
};

export default createUploadMiddleware;
