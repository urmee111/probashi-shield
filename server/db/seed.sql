-- Existing rows are kept when their demo license or corridor is already present.
INSERT INTO probashi_shield.agencies (license_no, name, status)
VALUES
    ('DEMO-RL-001', 'Demo Padma Recruitment', 'verified'),
    ('DEMO-RL-002', 'Demo Meghna Placement', 'verified'),
    ('DEMO-RL-003', 'Demo Jamuna Manpower', 'flagged'),
    ('DEMO-RL-004', 'Demo Surma Recruitment', 'verified'),
    ('DEMO-RL-005', 'Demo Karnaphuli Placement', 'flagged')
ON CONFLICT DO NOTHING;

-- The proposal supplies a historical Malaysia cap and a Cambodia risk scenario.
-- Other fee caps and risk levels are synthetic values for the demo.
INSERT INTO probashi_shield.corridors (country, country_code, max_legal_fee_bdt, corridor_risk_level, rule_source)
SELECT seed.country, seed.country_code, seed.max_legal_fee_bdt, seed.corridor_risk_level, seed.rule_source
FROM (
    VALUES
        ('Malaysia', 'MY', 78990.00, 'medium', 'ProbashiShield proposal historical cap. Risk level is a demo fixture.'),
        ('Cambodia', 'KH', NULL, 'high', 'ProbashiShield proposal risk scenario. Fee cap unspecified.'),
        ('Saudi Arabia', 'SA', 150000.00, 'medium', 'Synthetic demo fixture for the fee cap and risk level.'),
        ('United Arab Emirates', 'AE', 125000.00, 'low', 'Synthetic demo fixture for the fee cap and risk level.'),
        ('Qatar', 'QA', 110000.00, 'low', 'Synthetic demo fixture for the fee cap and risk level.'),
        ('Singapore', 'SG', 95000.00, 'medium', 'Synthetic demo fixture for the fee cap and risk level.')
) AS seed (country, country_code, max_legal_fee_bdt, corridor_risk_level, rule_source)
WHERE NOT EXISTS (
    SELECT 1
    FROM probashi_shield.corridors
    WHERE LOWER(corridors.country) = LOWER(seed.country) AND corridors.job_category IS NULL
)
ON CONFLICT (country_code) DO NOTHING;
