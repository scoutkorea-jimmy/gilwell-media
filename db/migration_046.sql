-- migration_046: Link Meeting Minutes posts to Calendar events (bidirectional)
ALTER TABLE dp_board_posts ADD COLUMN linked_event_id INTEGER REFERENCES dp_events(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_dp_board_posts_linked_event ON dp_board_posts(linked_event_id);
