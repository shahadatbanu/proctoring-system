/**
 * scripts/seed.js
 * Creates an admin user and a sample exam in MongoDB.
 * Run: node scripts/seed.js
 */

require('dotenv').config({ path: '../.env' });
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');
const { User, Exam } = require('../models');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/proctoring';

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB');

  // ── Admin user ──────────────────────────────────────────────────────────────
  const adminEmail = 'admin@proctor.ai';
  let admin = await User.findOne({ email: adminEmail });
  if (!admin) {
    admin = await User.create({
      name:         'Admin User',
      email:        adminEmail,
      passwordHash: await bcrypt.hash('Admin@1234', 12),
      role:         'admin',
    });
    console.log('✅  Admin created  →', adminEmail, ' / Admin@1234');
  } else {
    console.log('ℹ️  Admin already exists');
  }

  // ── Student user (for testing) ──────────────────────────────────────────────
  const studentEmail = 'student@proctor.ai';
  let student = await User.findOne({ email: studentEmail });
  if (!student) {
    student = await User.create({
      name:         'Test Student',
      email:        studentEmail,
      passwordHash: await bcrypt.hash('Student@1234', 12),
      role:         'student',
    });
    console.log('✅  Student created →', studentEmail, ' / Student@1234');
  } else {
    console.log('ℹ️  Student already exists');
  }

  // ── Sample exam ─────────────────────────────────────────────────────────────
  const examTitle = 'General Knowledge — Sample';
  let exam = await Exam.findOne({ title: examTitle });
  if (!exam) {
    exam = await Exam.create({
      title:       examTitle,
      description: 'A sample exam to test the proctoring system end-to-end.',
      duration:    30,
      createdBy:   admin._id,
      active:      true,
      questions: [
        {
          text:    'What is the capital of France?',
          options: ['London', 'Berlin', 'Paris', 'Madrid'],
          correct: 2,
        },
        {
          text:    'Which planet is closest to the Sun?',
          options: ['Venus', 'Mercury', 'Mars', 'Earth'],
          correct: 1,
        },
        {
          text:    'What is 12 × 12?',
          options: ['132', '144', '156', '124'],
          correct: 1,
        },
        {
          text:    'Who wrote "Romeo and Juliet"?',
          options: ['Charles Dickens', 'Mark Twain', 'Jane Austen', 'William Shakespeare'],
          correct: 3,
        },
        {
          text:    'Which language is used for styling web pages?',
          options: ['HTML', 'JavaScript', 'CSS', 'Python'],
          correct: 2,
        },
        {
          text:    'What is the boiling point of water in Celsius?',
          options: ['90°C', '95°C', '100°C', '105°C'],
          correct: 2,
        },
        {
          text:    'Which data structure uses LIFO order?',
          options: ['Queue', 'Array', 'Stack', 'Linked List'],
          correct: 2,
        },
        {
          text:    'What does HTTP stand for?',
          options: [
            'HyperText Transfer Protocol',
            'High Transfer Text Protocol',
            'HyperText Transmission Protocol',
            'Hyper Transfer Text Process',
          ],
          correct: 0,
        },
        {
          text:    'Which company created JavaScript?',
          options: ['Google', 'Microsoft', 'Netscape', 'Apple'],
          correct: 2,
        },
        {
          text:    'What is the time complexity of binary search?',
          options: ['O(n)', 'O(n²)', 'O(log n)', 'O(1)'],
          correct: 2,
        },
      ],
    });
    console.log('✅  Sample exam created →', examTitle);
  } else {
    console.log('ℹ️  Sample exam already exists');
  }

  console.log('\n🎉  Seed complete. Credentials:');
  console.log('   Admin:   admin@proctor.ai   / Admin@1234');
  console.log('   Student: student@proctor.ai / Student@1234');
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
