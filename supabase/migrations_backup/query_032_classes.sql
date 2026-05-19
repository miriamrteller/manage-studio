-- Query: View Migration 032 Data
-- Returns relevant columns for frontend public class listing

SELECT 
  id,
  name,
  day_of_week,
  start_time,
  end_time,
  max_capacity,
  price_minor,
  currency,
  tenant_subdomain
FROM public_classes_by_subdomain
WHERE tenant_subdomain = 'creativeballet'
ORDER BY day_of_week, start_time;
