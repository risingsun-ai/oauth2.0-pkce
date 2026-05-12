import 'dotenv/config'
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL!);
redis.on('error', (err) => {console.error('Service Redis Client Error:', err)});

export {redis};
