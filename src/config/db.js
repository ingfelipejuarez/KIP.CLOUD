// KIP · src/config/db.js
// Instancia única del cliente Prisma para toda la app

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development'
    ? ['query', 'warn', 'error']
    : ['warn', 'error'],
});

export default prisma;
