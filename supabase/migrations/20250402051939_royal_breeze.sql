-- Function to check if all fields in a task are non-null
CREATE OR REPLACE FUNCTION check_task_completion(lecture_number integer, task_id text, submission_data jsonb)
RETURNS boolean AS $$
BEGIN
  -- Check specific fields based on task_id
  CASE task_id
    -- Task 1-0
    WHEN '1-0' THEN
      RETURN submission_data->>'1_0_feedback' IS NOT NULL;
    
    -- Task 1-1
    WHEN '1-1' THEN
      RETURN (
        submission_data->>'1_1_industry' IS NOT NULL AND
        submission_data->>'1_1_positive' IS NOT NULL AND
        submission_data->>'1_1_negative' IS NOT NULL AND
        submission_data->>'1_1_insights' IS NOT NULL
      );
    
    -- Task 1-2
    WHEN '1-2' THEN
      RETURN (
        submission_data->>'1_2_human' IS NOT NULL AND
        submission_data->>'1_2_info' IS NOT NULL AND
        submission_data->>'1_2_physical' IS NOT NULL AND
        submission_data->>'1_2_financial' IS NOT NULL AND
        submission_data->>'1_2_strength' IS NOT NULL
      );
    
    -- Add similar checks for other tasks...
    
    ELSE
      RETURN false;
  END CASE;
END;
$$ LANGUAGE plpgsql;

-- Function to get progress for a specific lecture
CREATE OR REPLACE FUNCTION get_lecture_progress(user_id uuid, lecture_number integer)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
  task_count integer;
  completed_count integer;
BEGIN
  -- Get total number of tasks for the lecture
  SELECT COUNT(*)
  INTO task_count
  FROM task_templates t
  WHERE t.lecture_number = lecture_number;

  -- Get number of completed tasks
  SELECT COUNT(*)
  INTO completed_count
  FROM task_submissions s
  JOIN task_templates t ON s.template_id = t.id
  WHERE s.user_id = user_id
  AND t.lecture_number = lecture_number
  AND s.status = 'completed';

  -- Build result
  result = jsonb_build_object(
    'total', task_count,
    'completed', completed_count,
    'status', CASE 
      WHEN completed_count = 0 THEN 'not_started'
      WHEN completed_count < task_count THEN 'in_progress'
      ELSE 'completed'
    END
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;

-- Function to get overall progress
CREATE OR REPLACE FUNCTION get_overall_progress(user_id uuid)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
  total_tasks integer;
  completed_tasks integer;
BEGIN
  -- Get total number of tasks
  SELECT COUNT(*)
  INTO total_tasks
  FROM task_templates;

  -- Get number of completed tasks
  SELECT COUNT(*)
  INTO completed_tasks
  FROM task_submissions s
  WHERE s.user_id = user_id
  AND s.status = 'completed';

  -- Build result
  result = jsonb_build_object(
    'total', total_tasks,
    'completed', completed_tasks,
    'percentage', CASE 
      WHEN total_tasks = 0 THEN 0
      ELSE (completed_tasks::float / total_tasks::float) * 100
    END
  );

  RETURN result;
END;
$$ LANGUAGE plpgsql;