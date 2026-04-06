const mongoose = require('mongoose');

// ─── User ─────────────────────────────────────────────────────────────────────
const UserSchema = new mongoose.Schema({
  name:          { type: String, required: true },
  email:         { type: String, required: true, unique: true, lowercase: true },
  passwordHash:  { type: String, required: true },
  role:          { type: String, enum: ['student','admin'], default: 'student' },
  faceEmbedding: { type: [Number], default: null },   // 512-d ArcFace vector
  faceRegistered:{ type: Boolean, default: false },
  createdAt:     { type: Date, default: Date.now },
});

// ─── Exam ─────────────────────────────────────────────────────────────────────
const QuestionSchema = new mongoose.Schema({
  type:     { type: String, enum: ['multiple-choice', 'true-false', 'descriptive'], default: 'multiple-choice' },
  text:     { type: String, required: true },
  options:  [String],  // for multiple-choice and true-false
  correct:  { type: mongoose.Schema.Types.Mixed },  // number for single, array for multiple, string for descriptive
});

const ExamSchema = new mongoose.Schema({
  title:           { type: String, required: true },
  description:     String,
  duration:        { type: Number, required: true },   // minutes
  questions:       [QuestionSchema],
  scheduledAt:     { type: Date },  // when exam starts
  assignedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  createdBy:       { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  active:          { type: Boolean, default: true },
  createdAt:       { type: Date, default: Date.now },
});

// ─── ProctoringSession ────────────────────────────────────────────────────────
const SessionSchema = new mongoose.Schema({
  examId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Exam',  required: true },
  userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
  status:    { type: String, enum: ['active','completed','flagged','terminated','appeal_pending','appeal_approved','appeal_rejected'], default: 'active' },
  startedAt: { type: Date,   default: Date.now },
  endedAt:   Date,

  // Proctoring stats (updated in real-time)
  totalFramesAnalyzed: { type: Number, default: 0 },
  alertCount:          { type: Number, default: 0 },
  maxRiskScore:        { type: Number, default: 0 },
  avgRiskScore:        { type: Number, default: 0 },
  riskScoreHistory:    [Number],

  // Termination details
  terminationReason:   String,
  violationLog:        [{ timestamp: Date, type: String, details: mongoose.Schema.Types.Mixed }],
  terminatedBy:        { type: String, enum: ['system', 'admin'], default: 'system' },
  terminatedAt:        Date,

  // Appeal workflow
  appealSubmittedAt:   Date,
  appealReason:        String,
  appealStatus:        { type: String, enum: ['pending','approved','rejected'], default: null },
  appealReviewedAt:    Date,
  appealReviewedBy:    { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  appealNotes:         String,

  // Submission
  answers: [{ questionIndex: Number, selectedOption: Number }],
  score:   Number,
});

// ─── AlertLog ─────────────────────────────────────────────────────────────────
const AlertLogSchema = new mongoose.Schema({
  sessionId:   { type: mongoose.Schema.Types.ObjectId, ref: 'ProctoringSession', required: true },
  userId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  examId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  type:        {
    type: String,
    enum: [
      'NO_FACE_DETECTED', 'MULTIPLE_FACES_DETECTED', 'IDENTITY_MISMATCH',
      'SPOOF_ATTEMPT_DETECTED', 'HEAD_TURNED_LEFT', 'HEAD_TURNED_RIGHT',
      'HEAD_DOWN', 'HEAD_TILTED', 'LOOKING_AWAY', 'EYES_CLOSED',
      'PHONE_DETECTED', 'FACE_ABSENT_TIMEOUT',
    ],
  },
  riskScore:   Number,
  frameNumber: Number,
  timestamp:   { type: Date, default: Date.now },
  details:     mongoose.Schema.Types.Mixed,
});

// Index for fast per-session queries
AlertLogSchema.index({ sessionId: 1, timestamp: -1 });
SessionSchema.index({ userId: 1, examId: 1 });

// ─── ProctorSettings ──────────────────────────────────────────────────────────
const ProctorSettingsSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  value: mongoose.Schema.Types.Mixed,
  description: String,
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
});

// ─── AppealLog ────────────────────────────────────────────────────────────────
const AppealLogSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ProctoringSession', required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  terminationReason: String,
  violationsCount: Number,
  appealReason: String,
  submitDate: { type: Date, default: Date.now },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  reviewDate: Date,
  reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  reviewNotes: String,
  decision: String,
});

AppealLogSchema.index({ sessionId: 1 });
AppealLogSchema.index({ status: 1, submitDate: -1 });

module.exports = {
  User:               mongoose.model('User',               UserSchema),
  Exam:               mongoose.model('Exam',               ExamSchema),
  ProctoringSession:  mongoose.model('ProctoringSession',  SessionSchema),
  AlertLog:           mongoose.model('AlertLog',           AlertLogSchema),
  ProctorSettings:    mongoose.model('ProctorSettings',    ProctorSettingsSchema),
  AppealLog:          mongoose.model('AppealLog',          AppealLogSchema),
};
