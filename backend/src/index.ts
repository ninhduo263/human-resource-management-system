import { createExpressApp } from './app.js';
import { initSchema, pool } from './db/pool.js';
import { seedDatabase } from './db/seed.js';
import { startJobScheduler } from './services/jobs.js';

const PORT = Number(process.env.PORT || 5000);

async function bootstrap() {
  let retries = 15;
  while (retries > 0) {
    try {
      await initSchema();
      await seedDatabase();
      break;
    } catch (err) {
      retries--;
      console.log(`Đang chờ kết nối PostgreSQL... (còn ${retries} lần thử)`);
      if (retries === 0) {
        console.error('Không thể kết nối tới PostgreSQL:', err);
        process.exit(1);
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  startJobScheduler();
  const app = createExpressApp();
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`PeopleOps Backend (Express + TypeScript + PostgreSQL) đang chạy tại cổng ${PORT}`);
  });

  const shutdown = async () => {
    server.close();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

bootstrap();
