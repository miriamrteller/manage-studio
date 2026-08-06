-- DL-DESIGN-009 seed: font_pair assignments per vertical

-- Creative Ballet → elegant (dance/ballet vertical)
UPDATE tenants 
SET font_pair = 'elegant' 
WHERE subdomain = 'creativeballet';

-- Bella Dance → dynamic (energetic dance studio)
UPDATE tenants 
SET font_pair = 'dynamic' 
WHERE subdomain = 'belladance';

-- Velvet Beauty → warm (beauty/wellness vertical)
UPDATE tenants 
SET font_pair = 'warm' 
WHERE subdomain = 'velvetbeauty';

-- All other tenants keep NULL (= reliable default)
-- No explicit update needed; they inherit the column default behavior
