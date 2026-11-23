-- Existing rows are kept when their demo license or corridor is already present.
INSERT INTO probashi_shield.agencies (license_no, name, status)
VALUES
    ('DEMO-RL-001', 'Demo Padma Recruitment', 'verified'),
    ('DEMO-RL-002', 'Demo Meghna Placement', 'verified'),
    ('DEMO-RL-003', 'Demo Jamuna Manpower', 'flagged'),
    ('DEMO-RL-004', 'Demo Surma Recruitment', 'verified'),
    ('DEMO-RL-005', 'Demo Karnaphuli Placement', 'flagged')
ON CONFLICT DO NOTHING;

INSERT INTO probashi_shield.agencies (license_no, name, status, notes)
VALUES ('RL-9911', 'Demo Horizon Recruitment', 'flagged', 'Fictional agency fixture for the document audit demo.')
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

-- Complete the original demo rows without replacing any existing category or salary data.
UPDATE probashi_shield.corridors AS corridor
SET job_category = demo.job_category,
    min_expected_salary_bdt = demo.salary_floor,
    max_expected_salary_bdt = demo.salary_ceiling,
    rule_source = corridor.rule_source || ' Job category and salary range are synthetic demo data.'
FROM (
    VALUES
        ('MY', 'Plantation/Factory', 35000.00, 55000.00, 'ProbashiShield proposal historical cap. Risk level is a demo fixture.'),
        ('SA', 'Construction', 38000.00, 62000.00, 'Synthetic demo fixture for the fee cap and risk level.'),
        ('AE', 'Hospitality', 42000.00, 70000.00, 'Synthetic demo fixture for the fee cap and risk level.'),
        ('QA', 'Construction', 43000.00, 68000.00, 'Synthetic demo fixture for the fee cap and risk level.'),
        ('SG', 'Manufacturing', 55000.00, 85000.00, 'Synthetic demo fixture for the fee cap and risk level.')
) AS demo (country_code, job_category, salary_floor, salary_ceiling, original_source)
WHERE corridor.country_code = demo.country_code
    AND corridor.rule_source = demo.original_source
    AND corridor.job_category IS NULL
    AND corridor.min_expected_salary_bdt IS NULL
    AND corridor.max_expected_salary_bdt IS NULL;
