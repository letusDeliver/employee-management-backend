import trainingProgramService from './trainingProgram.service.js';

const create = async (req, res) => {
  const program = await trainingProgramService.createTrainingProgram(req.body, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(201).json({ trainingProgram: program });
};

const list = async (req, res) => {
  const result = await trainingProgramService.listTrainingPrograms(req.validatedQuery);
  res.status(200).json(result);
};

const getById = async (req, res) => {
  const program = await trainingProgramService.getTrainingProgramById(req.params.id);
  res.status(200).json({ trainingProgram: program });
};

const update = async (req, res) => {
  const program = await trainingProgramService.updateTrainingProgram(req.params.id, req.body, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ trainingProgram: program });
};

const remove = async (req, res) => {
  await trainingProgramService.deleteTrainingProgram(req.params.id, {
    id: req.user.id,
    ipAddress: req.ip,
  });
  res.status(200).json({ message: 'Training program deleted successfully' });
};

export default { create, list, getById, update, remove };
