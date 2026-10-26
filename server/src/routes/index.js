import { Router } from 'express';
import healthRoutes from './health.routes.js';
import authRoutes from './auth.routes.js';
import adminRoutes from './admin.routes.js';
import teacherRoutes from './teacher.routes.js';
import parentRoutes from './parent.routes.js';
import studentRoutes from './students.routes.js';
import rfidCardRoutes from './rfidCards.routes.js';
import attendanceRoutes from './attendance.routes.js';
import performanceRoutes from './performance.routes.js';
import dismissalRoutes from './dismissals.routes.js';
import reportRoutes from './reports.routes.js';
import notificationRoutes from './notifications.routes.js';
import accountRoutes from './account.routes.js';
import devRoutes from './dev.routes.js';
import { env } from '../config/env.js';

// Mounts every feature router under /api. Add new feature routers here.
const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/admin', adminRoutes);
router.use('/teacher', teacherRoutes);
router.use('/parent', parentRoutes);
router.use('/students', studentRoutes);
router.use('/rfid-cards', rfidCardRoutes);
router.use('/attendance', attendanceRoutes);
router.use('/performance', performanceRoutes);
router.use('/dismissals', dismissalRoutes);
router.use('/reports', reportRoutes);
router.use('/notifications', notificationRoutes);
router.use('/account', accountRoutes);

// Development-only helpers (mock SMS). Never mounted in production; see dev.routes.js.
if (!env.isProduction && env.sms.provider === 'mock') {
  router.use('/dev', devRoutes);
}

export default router;
