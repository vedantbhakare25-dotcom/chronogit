import express from 'express';
import cors from 'cors';

import monitorsRouter from './routes/monitors.js';
import usersRouter from './routes/users.js';
import mockRouter from './routes/mock.js';
import { AppError } from './utils/AppError.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (req, res) => res.json({ ok: true }));
  app.use('/api/monitors', monitorsRouter);
  app.use('/api/users', usersRouter);
  app.use('/api/mock', mockRouter);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Centralized error handler
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({ error: err.message, details: err.details });
    }

    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    if (err.name === 'CastError') {
      return res.status(400).json({ error: `Invalid ${err.path}: ${err.value}` });
    }

    console.error(err);
    return res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}