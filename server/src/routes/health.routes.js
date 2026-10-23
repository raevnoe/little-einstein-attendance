import { Router } from 'express';

const router = Router();

// GET /api/health - lets the client (and deploy checks) confirm the API is up.
router.get('/', (req, res) => {
  res.json({
    status: 'ok',
    service: 'little-einstein-api',
    timestamp: new Date().toISOString(),
  });
});

export default router;
