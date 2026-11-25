const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const router = express.Router();

// FIX (no schema validation): title is required, both fields are trimmed and
// have length limits, so empty or huge notes are rejected by the database layer.
// FIX (mass assignment): owner is a real reference to a user and is set by the
// server only. timestamps are managed by Mongoose, not by the client.
const noteSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
      minlength: [1, 'Title cannot be empty'],
      maxlength: [200, 'Title must be at most 200 characters']
    },
    content: {
      type: String,
      trim: true,
      default: '',
      maxlength: [10000, 'Content must be at most 10000 characters']
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    isPinned: { type: Boolean, default: false }
  },
  { timestamps: true }
);

const Note = mongoose.models.Note || mongoose.model('Note', noteSchema);

// FIX (no error handling): async errors are passed to next() instead of being
// lost as unhandled promise rejections that leave the request hanging.
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// FIX (no authentication): every route requires a valid token, and req.user
// tells us who is making the request.
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.sub };
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

router.use(requireAuth);

// FIX (invalid ids): a malformed id gets a clean 400 instead of a CastError,
// and this applies to GET one, PUT and DELETE alike.
router.param('id', (req, res, next, id) => {
  if (!/^[a-f\d]{24}$/i.test(id)) {
    return res.status(400).json({ error: 'Invalid note id' });
  }
  return next();
});

// FIX (mass assignment): only copy the fields the client is allowed to set.
// Anything else in req.body (owner, _id, createdAt, ...) is ignored.
const ALLOWED_FIELDS = ['title', 'content', 'isPinned'];
function pickAllowed(body) {
  const result = {};
  for (const key of ALLOWED_FIELDS) {
    if (body && body[key] !== undefined) result[key] = body[key];
  }
  return result;
}

// FIX (regex injection / ReDoS): user text is escaped before being used in a
// regular expression, so it is matched literally.
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

router.get(
  '/notes',
  asyncHandler(async (req, res) => {
    // FIX (no ownership check): users only ever see their own notes.
    const filter = { owner: req.user.id };

    // FIX (regex injection): search must be a short plain string, then escaped.
    if (typeof req.query.search === 'string' && req.query.search.trim()) {
      const search = req.query.search.trim().slice(0, 100);
      filter.title = new RegExp(escapeRegex(search), 'i');
    }

    // FIX (no limit on list size): results are paginated with a hard maximum.
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);

    const notes = await Note.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({ page, limit, data: notes });
  })
);

router.get(
  '/notes/:id',
  asyncHandler(async (req, res) => {
    // FIX (no ownership check): the note must belong to the current user.
    const note = await Note.findOne({ _id: req.params.id, owner: req.user.id });

    // FIX (missing 404): a note that does not exist returns 404, not 200 + null.
    if (!note) return res.status(404).json({ error: 'Note not found' });

    res.json(note);
  })
);

router.post(
  '/notes',
  asyncHandler(async (req, res) => {
    // FIX (mass assignment): only allowed fields, and owner comes from the token.
    const note = await Note.create({ ...pickAllowed(req.body), owner: req.user.id });

    // FIX (wrong status code): creating a resource returns 201 Created.
    res.status(201).json(note);
  })
);

router.put(
  '/notes/:id',
  asyncHandler(async (req, res) => {
    // FIX (mass assignment): only allowed fields can be updated.
    const updates = pickAllowed(req.body);
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // FIX (no ownership check): only the owner's note can be matched.
    // FIX (old document returned): new: true returns the updated note.
    // FIX (validation skipped on update): runValidators applies schema rules.
    const note = await Note.findOneAndUpdate(
      { _id: req.params.id, owner: req.user.id },
      { $set: updates },
      { new: true, runValidators: true }
    );

    // FIX (missing 404): report when there is nothing to update.
    if (!note) return res.status(404).json({ error: 'Note not found' });

    res.json(note);
  })
);

router.delete(
  '/notes/:id',
  asyncHandler(async (req, res) => {
    // FIX (no ownership check): users can only delete their own notes.
    const note = await Note.findOneAndDelete({ _id: req.params.id, owner: req.user.id });

    // FIX (missing 404): do not claim success when nothing was deleted.
    if (!note) return res.status(404).json({ error: 'Note not found' });

    res.json({ message: 'Note deleted' });
  })
);

// FIX (raw errors returned to the client): validation problems get a 400 with
// only our own readable messages; anything else is logged on the server and
// the client receives a generic message with no stack trace or internals.
// eslint-disable-next-line no-unused-vars
router.use((err, req, res, next) => {
  if (err instanceof mongoose.Error.ValidationError) {
    const messages = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ error: 'Validation failed', details: messages });
  }
  if (err instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: 'Invalid value for ' + err.path });
  }
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
});

module.exports = router;
