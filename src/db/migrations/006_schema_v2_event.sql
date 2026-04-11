-- v2: add actor field to event envelope
ALTER TABLE event ADD COLUMN actor TEXT;
