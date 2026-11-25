const express = require('express');
const mongoose = require('mongoose');

const router = express.Router();

const noteSchema = new mongoose.Schema({
  title: String,
  content: String,
  owner: String,
  isPinned: Boolean,
  createdAt: { type: Date, default: Date.now }
});

const Note = mongoose.model('Note', noteSchema);

router.get('/notes', async (req, res) => {
  const filter = {};
  if (req.query.search) {
    filter.title = new RegExp(req.query.search, 'i');
  }
  const notes = await Note.find(filter).sort({ createdAt: -1 });
  res.json(notes);
});

router.get('/notes/:id', async (req, res) => {
  const note = await Note.findById(req.params.id);
  res.json(note);
});

router.post('/notes', async (req, res) => {
  try {
    const note = await Note.create(req.body);
    res.status(200).json(note);
  } catch (err) {
    res.status(500).json(err);
  }
});

router.put('/notes/:id', async (req, res) => {
  try {
    const note = await Note.findByIdAndUpdate(req.params.id, req.body);
    res.json(note);
  } catch (err) {
    res.status(500).send(err.stack);
  }
});

router.delete('/notes/:id', async (req, res) => {
  await Note.findByIdAndDelete(req.params.id);
  res.json({ message: 'Note deleted' });
});

module.exports = router;
