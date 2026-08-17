import { supabase } from './supabase';

export type FeedbackInput = {
  playerName: string;
  rating: number;
  message: string;
  room: number;
};

export async function sendFeedback(input: FeedbackInput) {
  return supabase.from('feedbacks').insert({
    player_name: input.playerName,
    rating: input.rating,
    message: input.message,
    room: input.room,
  });
}
