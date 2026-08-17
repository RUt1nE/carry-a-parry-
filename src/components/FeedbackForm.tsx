import { FormEvent, useState } from 'react';
import { isSupabaseConfigured } from '../lib/supabase';
import { sendFeedback } from '../lib/feedbacks';

type FeedbackFormProps = {
  playerName: string;
  room: number;
  canSend: boolean;
};

export function FeedbackForm({ playerName, room, canSend }: FeedbackFormProps) {
  const [rating, setRating] = useState(5);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [sending, setSending] = useState(false);

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = message.trim();
    if (!trimmed || sending || !canSend) return;
    setSending(true);
    setStatus('');
    const { error } = await sendFeedback({ playerName, rating, message: trimmed, room });
    setSending(false);
    if (error) {
      setStatus(`Не отправилось: ${error.message}`);
      return;
    }
    setMessage('');
    setRating(5);
    setStatus('Спасибо! Фидбек отправлен.');
  }

  if (!isSupabaseConfigured) {
    return (
      <section className="feedback-card">
        <h2>Feedback</h2>
        <p>Feedback появится после настройки Supabase в Vercel.</p>
      </section>
    );
  }

  return (
    <section className="feedback-card">
      <h2>Feedback</h2>
      <form className="feedback-form" onSubmit={submitFeedback}>
        <label>
          Оценка
          <select value={rating} onChange={(event) => setRating(Number(event.target.value))} disabled={!canSend || sending}>
            <option value={5}>5 - круто</option>
            <option value={4}>4 - хорошо</option>
            <option value={3}>3 - нормально</option>
            <option value={2}>2 - сложно</option>
            <option value={1}>1 - надо чинить</option>
          </select>
        </label>
        <label>
          Что улучшить?
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Например: босс слишком быстрый, непонятна кнопка..."
            maxLength={500}
            disabled={!canSend || sending}
          />
        </label>
        <button type="submit" disabled={!canSend || sending || !message.trim()}>
          {sending ? 'Sending...' : 'Send feedback'}
        </button>
      </form>
      {!canSend && <p>Войди через Google, чтобы отправить фидбек.</p>}
      {status && <p>{status}</p>}
    </section>
  );
}
