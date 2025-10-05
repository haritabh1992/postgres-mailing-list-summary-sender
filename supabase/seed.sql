-- Seed data for development and testing

-- Insert some sample subscribers
INSERT INTO subscribers (email, subscribed_at, is_active) VALUES
  ('test1@example.com', NOW() - INTERVAL '7 days', true),
  ('test2@example.com', NOW() - INTERVAL '3 days', true),
  ('test3@example.com', NOW() - INTERVAL '1 day', true),
  ('inactive@example.com', NOW() - INTERVAL '14 days', false);

-- Insert some sample mail threads
INSERT INTO mail_threads (thread_url, subject, post_date, thread_id, message_count, is_processed) VALUES
  ('https://www.postgresql.org/message-id/msg-001', 'Re: [HACKERS] Performance improvement in VACUUM', NOW() - INTERVAL '2 days', 'thread-vacuum-001', 1, true),
  ('https://www.postgresql.org/message-id/msg-002', 'Re: [HACKERS] Performance improvement in VACUUM', NOW() - INTERVAL '1 day', 'thread-vacuum-001', 1, true),
  ('https://www.postgresql.org/message-id/msg-003', 'Re: [HACKERS] Performance improvement in VACUUM', NOW() - INTERVAL '12 hours', 'thread-vacuum-001', 1, true),
  ('https://www.postgresql.org/message-id/msg-004', '[HACKERS] New JSON functions proposal', NOW() - INTERVAL '3 days', 'thread-json-001', 1, true),
  ('https://www.postgresql.org/message-id/msg-005', 'Re: [HACKERS] New JSON functions proposal', NOW() - INTERVAL '2 days', 'thread-json-001', 1, true),
  ('https://www.postgresql.org/message-id/msg-006', '[HACKERS] Security vulnerability in authentication', NOW() - INTERVAL '4 days', 'thread-security-001', 1, true),
  ('https://www.postgresql.org/message-id/msg-007', 'Re: [HACKERS] Security vulnerability in authentication', NOW() - INTERVAL '3 days', 'thread-security-001', 1, true),
  ('https://www.postgresql.org/message-id/msg-008', 'Re: [HACKERS] Security vulnerability in authentication', NOW() - INTERVAL '2 days', 'thread-security-001', 1, true),
  ('https://www.postgresql.org/message-id/msg-009', '[HACKERS] Documentation improvements needed', NOW() - INTERVAL '5 days', 'thread-docs-001', 1, true),
  ('https://www.postgresql.org/message-id/msg-010', 'Re: [HACKERS] Documentation improvements needed', NOW() - INTERVAL '4 days', 'thread-docs-001', 1, true);

-- Insert a sample weekly summary
INSERT INTO weekly_summaries (week_start_date, week_end_date, summary_content, top_discussions, total_posts, total_participants) VALUES
  (
    (NOW() - INTERVAL '7 days')::date,
    (NOW() - INTERVAL '1 day')::date,
    'PostgreSQL Weekly Summary - Week of ' || (NOW() - INTERVAL '7 days')::date || E'\n\n## Overview\nThis week saw significant activity in the PostgreSQL mailing list with discussions covering performance improvements, security issues, and new feature proposals.\n\n## Top Discussions\n\n### 1. Performance improvement in VACUUM\n- **Posts**: 3\n- **Participants**: 3\n- **Duration**: ' || (NOW() - INTERVAL '2 days')::date || ' - ' || (NOW() - INTERVAL '12 hours')::date || E'\n\nThis discussion generated significant interest with proposals for improving VACUUM performance. The community is actively discussing benchmarks and potential implementation details.\n\n### 2. Security vulnerability in authentication\n- **Posts**: 3\n- **Participants**: 3\n- **Duration**: ' || (NOW() - INTERVAL '4 days')::date || ' - ' || (NOW() - INTERVAL '2 days')::date || E'\n\nA critical security issue was reported and the maintainers are working on a fix. The community is collaborating on testing and validation.\n\n### 3. New JSON functions proposal\n- **Posts**: 2\n- **Participants**: 2\n- **Duration**: ' || (NOW() - INTERVAL '3 days')::date || ' - ' || (NOW() - INTERVAL '2 days')::date || E'\n\nA proposal for new JSON functions is under discussion, with questions about performance implications being raised.\n\n## Key Highlights\n- Active community participation with diverse technical perspectives\n- Focus on performance improvements and security\n- Continued development of new features and optimizations\n\n## Next Steps\nThe community continues to work on these important topics, with ongoing discussions expected to shape future PostgreSQL releases.\n\n---\n*This summary was generated automatically. For the full discussions, visit the PostgreSQL mailing list archives.*',
    jsonb_build_array(
      jsonb_build_object(
        'thread_id', 'thread-vacuum-001',
        'subject', 'Re: [HACKERS] Performance improvement in VACUUM',
        'post_count', 3,
        'participants', 3,
        'first_post_at', (NOW() - INTERVAL '2 days')::timestamp,
        'last_post_at', (NOW() - INTERVAL '12 hours')::timestamp
      ),
      jsonb_build_object(
        'thread_id', 'thread-security-001',
        'subject', '[HACKERS] Security vulnerability in authentication',
        'post_count', 3,
        'participants', 3,
        'first_post_at', (NOW() - INTERVAL '4 days')::timestamp,
        'last_post_at', (NOW() - INTERVAL '2 days')::timestamp
      ),
      jsonb_build_object(
        'thread_id', 'thread-json-001',
        'subject', '[HACKERS] New JSON functions proposal',
        'post_count', 2,
        'participants', 2,
        'first_post_at', (NOW() - INTERVAL '3 days')::timestamp,
        'last_post_at', (NOW() - INTERVAL '2 days')::timestamp
      )
    ),
    10,
    7
  );

-- Insert some sample processing logs
INSERT INTO processing_logs (process_type, status, message, started_at, completed_at) VALUES
  ('email_fetch', 'success', 'Processed 10 emails successfully', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour' + INTERVAL '5 minutes'),
  ('summary_generation', 'success', 'Generated summary for week starting ' || (NOW() - INTERVAL '7 days')::date, NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '25 minutes'),
  ('email_send', 'success', 'Sent 3 emails successfully', NOW() - INTERVAL '20 minutes', NOW() - INTERVAL '15 minutes');
