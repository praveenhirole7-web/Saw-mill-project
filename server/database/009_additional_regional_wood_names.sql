-- Add regional names for the remaining familiar Indian timber types.
-- Names are intentionally unverified until reviewed by fluent speakers.
-- Apply after 007_wood_type_catalogue.sql; this migration is safe to rerun.

INSERT IGNORE INTO `wood_names` (`wood_type_id`, `language_code`, `name`, `name_kind`, `verified`)
SELECT wt.id, names.language_code, names.name, 'preferred', FALSE
FROM (
  SELECT 'shisham' slug, 'kn' language_code, 'ಶೀಶಂ' name UNION ALL
  SELECT 'shisham', 'hi', 'शीशम' UNION ALL SELECT 'shisham', 'te', 'శీశం' UNION ALL SELECT 'shisham', 'ta', 'ஷீஷம்' UNION ALL
  SELECT 'sal', 'kn', 'ಸಾಲ್' UNION ALL SELECT 'sal', 'hi', 'साल' UNION ALL SELECT 'sal', 'te', 'సాల్' UNION ALL SELECT 'sal', 'ta', 'சால்' UNION ALL
  SELECT 'deodar', 'kn', 'ದೇವದಾರು' UNION ALL SELECT 'deodar', 'hi', 'देवदार' UNION ALL SELECT 'deodar', 'te', 'దేవదారు' UNION ALL SELECT 'deodar', 'ta', 'தேவதாரு' UNION ALL
  SELECT 'pine', 'kn', 'ಪೈನ್' UNION ALL SELECT 'pine', 'hi', 'चीड़' UNION ALL SELECT 'pine', 'te', 'పైన్' UNION ALL SELECT 'pine', 'ta', 'பைன்' UNION ALL
  SELECT 'acacia', 'kn', 'ಅಕೇಶಿಯಾ' UNION ALL SELECT 'acacia', 'hi', 'अकेशिया' UNION ALL SELECT 'acacia', 'te', 'అకేషియా' UNION ALL SELECT 'acacia', 'ta', 'அகேசியா' UNION ALL
  SELECT 'silver-oak', 'kn', 'ಸಿಲ್ವರ್ ಓಕ್' UNION ALL SELECT 'silver-oak', 'hi', 'सिल्वर ओक' UNION ALL SELECT 'silver-oak', 'te', 'సిల్వర్ ఓక్' UNION ALL SELECT 'silver-oak', 'ta', 'சில்வர் ஓக்' UNION ALL
  SELECT 'tamarind', 'kn', 'ಹುಣಸೆ' UNION ALL SELECT 'tamarind', 'hi', 'इमली' UNION ALL SELECT 'tamarind', 'te', 'చింత' UNION ALL SELECT 'tamarind', 'ta', 'புளி' UNION ALL
  SELECT 'honge-indian-beech', 'kn', 'ಹೊಂಗೆ' UNION ALL SELECT 'honge-indian-beech', 'hi', 'करंज' UNION ALL SELECT 'honge-indian-beech', 'te', 'కానుగ' UNION ALL SELECT 'honge-indian-beech', 'ta', 'புங்கை'
) AS names
JOIN `wood_types` wt ON wt.slug = names.slug;
