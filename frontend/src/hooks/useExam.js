// src/hooks/useExam.js
import { useState, useEffect, useCallback, useRef } from 'react';

const BACKEND = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';

export default function useExam({ examId, sessionId, token }) {
  const [exam,      setExam]      = useState(null);
  const [answers,   setAnswers]   = useState({});   // { questionIndex: optionIndex }
  const [timeLeft,  setTimeLeft]  = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [result,    setResult]    = useState(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState(null);
  const timerRef = useRef(null);

  // ── Load exam ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!examId || !token) return;
    fetch(`${BACKEND}/api/exam/${examId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) throw new Error(data.error);
        setExam(data);
        setTimeLeft(data.duration * 60);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [examId, token]);

  // ── Countdown ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (timeLeft === null || submitted) return;
    if (timeLeft <= 0) { submitExam(); return; }
    timerRef.current = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(timerRef.current);
  }, [timeLeft, submitted]);

  // ── Select answer ──────────────────────────────────────────────────────────
  const selectAnswer = useCallback((questionIndex, optionIndex) => {
    if (submitted) return;
    setAnswers(prev => ({ ...prev, [questionIndex]: optionIndex }));
  }, [submitted]);

  // ── Submit ─────────────────────────────────────────────────────────────────
  const submitExam = useCallback(async () => {
    if (submitted) return;
    clearTimeout(timerRef.current);
    setSubmitted(true);

    const answersArr = Object.entries(answers).map(([qi, oi]) => ({
      questionIndex:  parseInt(qi),
      selectedOption: oi,
    }));

    try {
      const res  = await fetch(`${BACKEND}/api/exam/${examId}/submit`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ sessionId, answers: answersArr }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResult(data);

      // Mark session as completed
      await fetch(`${BACKEND}/api/session/${sessionId}/end`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ status: 'completed' }),
      }).catch(() => {});
    } catch (err) {
      setError(`Submission failed: ${err.message}`);
      setSubmitted(false);
    }
  }, [submitted, answers, examId, sessionId, token]);

  const answeredCount = Object.keys(answers).length;
  const totalCount    = exam?.questions?.length || 0;
  const progressPct   = totalCount ? Math.round((answeredCount / totalCount) * 100) : 0;

  return {
    exam, answers, timeLeft, submitted, result,
    loading, error, answeredCount, totalCount, progressPct,
    selectAnswer, submitExam,
  };
}
