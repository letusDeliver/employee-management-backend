import AppError from './AppError.js';

class ServiceUnavailableError extends AppError {
  constructor(message = 'Service Unavailable') {
    super(message, 503);
  }
}

export default ServiceUnavailableError;
