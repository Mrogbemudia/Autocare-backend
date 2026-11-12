import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';

const app = express();
app.set('trust proxy', 1); // behind Render's proxy: correct client IPs for rate limiting
app.disable('x-powered-by');

app.use(helmet());
// With the Vercel/Vite proxy the browser talks to one origin, so CORS is normally not needed.
if (env.corsOrigins.length) app.use(cors({ origin: env.corsOrigins, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
if (!env.isTest) app.use(morgan(env.isProd ? 'combined' : 'dev'));

app.get('/health', (req, res) => res.json({ status: 'ok' })); // cheap: no DB, for Render's health check
app.use('/api', apiLimiter, routes);
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
