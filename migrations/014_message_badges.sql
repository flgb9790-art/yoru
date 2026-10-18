-- Personal messages have their own inbox and badge. Keep the messages themselves.
DELETE FROM social_notifications WHERE kind='message';
