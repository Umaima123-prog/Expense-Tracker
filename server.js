require('dotenv').config({ quiet: true });

const mongoose = require('mongoose');

// The Express app itself (middleware, routes, error handler) lives in app.js
const app = require('./app');

const PORT = 3000;

// ---------- Start ----------

async function start() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is missing. Add it to your .env file.');
    process.exit(1);
  }

  // Without a secret we cannot sign or check tokens, so don't start at all.
  // (We only check that it exists; we never print its value.)
  if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET is missing. Add it to your .env file.');
    process.exit(1);
  }

  try {
    // 1) Connect to the database first...
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');

    // 2) ...and only then start accepting requests.
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    // Only print the error message, never the connection string itself.
    console.error('Could not connect to MongoDB:', err.message);
    process.exit(1);
  }
}

start();
