// models/Expense.js
// A Mongoose "model" describes what one expense document looks like in MongoDB
// and which rules (validation) it must follow before it can be saved.

const mongoose = require('mongoose');

// The list of allowed categories. We export it so other files can reuse it.
const CATEGORIES = ['Food', 'Transport', 'Bills', 'Other'];

const expenseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true, // removes spaces at the start and end: "  Pizza " -> "Pizza"
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      // A custom validator: the function must return true for the value to be valid.
      validate: {
        validator: (value) => value > 0,
        message: 'Amount must be greater than 0',
      },
    },
    category: {
      type: String,
      required: [true, 'Category is required'],
      enum: {
        values: CATEGORIES,
        message: 'Category must be one of: ' + CATEGORIES.join(', '),
      },
    },
    date: {
      type: Date,
      required: [true, 'Date is required'],
      default: Date.now, // if no date is sent, use "right now"
    },
    // The owner of this expense. "ref: 'User'" tells Mongoose that this id
    // points to a document in the User model. The routes always set it from
    // the logged-in user (req.user), never from the request body.
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User is required'],
      index: true, // we filter by user in every query, so an index makes that fast
    },
  },
  {
    timestamps: true, // automatically adds createdAt and updatedAt fields
  }
);

// Create the model. Mongoose will store documents in the "expenses" collection.
const Expense = mongoose.model('Expense', expenseSchema);

module.exports = Expense;
module.exports.CATEGORIES = CATEGORIES;
