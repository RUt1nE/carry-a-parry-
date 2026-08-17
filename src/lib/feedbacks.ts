import { supabase } from './supabase';

export type FeedbackInput = {
  playerName: string;
  rating: number;
  message: string;
  room: number;
};

export type FeedbackItem = {
  id: string;
  player_name: string;
  rating: number;
  message: string;
  room: number;
  created_at: string;
};

export async function loadFeedbacks() {
  return supabase
    .from('feedbacks')
    .select('id, player_name, rating, message, room, created_at')
    .order('created_at', { ascending: false })
    .limit(6);
}

export async function sendFeedback(input: FeedbackInput) {
  return supabase.from('feedbacks').insert({
    player_name: input.playerName,
    rating: input.rating,
    message: input.message,
    room: input.room,
  });
}
