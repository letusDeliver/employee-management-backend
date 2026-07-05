import cloudinaryPkg from 'cloudinary';

import env from './env.js';

const { v2: cloudinary } = cloudinaryPkg;

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

export default cloudinary;
