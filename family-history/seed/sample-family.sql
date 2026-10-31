-- A small, entirely fictional family for local development and screenshots.
-- Load with: npm run db:seed:local   (never run this against the real database)

INSERT INTO persons (id, given_names, surname, nickname, sex, birth_date, birth_year, birth_place, death_date, death_year, death_place, is_living, summary, created_at, updated_at) VALUES
 ('p-thomas',  'Thomas',       'Ashworth',  NULL,            'M', '3 MAR 1858',  1858, 'Bolton, Lancashire, England',     '14 JAN 1931', 1931, 'Burlington, Vermont', 0,
  'A mill mechanic who crossed the Atlantic in 1880 with eleven dollars and a canvas bag of tools.', 0, 0),
 ('p-mary',    'Mary Ellen',   'Doyle',     NULL,            'F', 'ABT 1861',    1861, 'Ennis, County Clare, Ireland',    '2 NOV 1940',  1940, 'Burlington, Vermont', 0, NULL, 0, 0),
 ('p-maggie',  'Margaret',     'Ashworth',  'Grandma Maggie','F', '19 JUN 1884', 1884, 'Burlington, Vermont',             '8 DEC 1962',  1962, 'Winooski, Vermont',   0,
  'Ran the boarding house on Pearl Street for thirty years.

Family lore says she never turned away a traveller, though she charged the ones she didn''t like double.', 0, 0),
 ('p-william', 'William',      'Ashworth',  NULL,            'M', '1887',        1887, 'Burlington, Vermont',             '12 SEP 1918', 1918, 'Saint-Mihiel, France',0, NULL, 0, 0),
 ('p-samuel',  'Samuel James', 'Whitcombe', NULL,            'M', '1880',        1880, 'Montpelier, Vermont',             '1951',        1951, 'Winooski, Vermont',   0, NULL, 0, 0),
 ('p-nell',    'Eleanor',      'Whitcombe', 'Nell',          'F', '2 APR 1909',  1909, 'Winooski, Vermont',               '30 AUG 1999', 1999, 'Albany, New York',    0, NULL, 0, 0),
 ('p-robert',  'Robert',       'Whitcombe', NULL,            'M', '1912',        1912, 'Winooski, Vermont',               '1987',        1987, NULL,                  0, NULL, 0, 0),
 ('p-harold',  'Harold',       'Pierce',    NULL,            'M', '1905',        1905, 'Troy, New York',                  '1980',        1980, 'Albany, New York',    0, NULL, 0, 0),
 ('p-ruth',    'Ruth Eleanor', 'Pierce',    NULL,            'F', '1938',        1938, 'Albany, New York',                NULL,          NULL, NULL,                  1, NULL, 0, 0),
 ('p-james',   'James',        'Miller',    NULL,            'M', '1936',        1936, NULL,                              '2015',        2015, NULL,                  0, NULL, 0, 0),
 ('p-anne',    'Anne',         'Miller',    NULL,            'F', '1964',        1964, 'Albany, New York',                NULL,          NULL, NULL,                  1, NULL, 0, 0),
 ('p-david',   'David',        'Miller',    NULL,            'M', '1967',        1967, 'Albany, New York',                NULL,          NULL, NULL,                  1, NULL, 0, 0);

INSERT INTO families (id, partner1_id, partner2_id, marriage_date, marriage_year, marriage_place) VALUES
 ('f-1', 'p-thomas', 'p-mary',   '1882',        1882, 'Burlington, Vermont'),
 ('f-2', 'p-samuel', 'p-maggie', '11 OCT 1906', 1906, 'Burlington, Vermont'),
 ('f-3', 'p-harold', 'p-nell',   '1932',        1932, 'Winooski, Vermont'),
 ('f-4', 'p-james',  'p-ruth',   '1961',        1961, 'Albany, New York');

INSERT INTO family_children (family_id, child_id, sort_order) VALUES
 ('f-1', 'p-maggie', 1), ('f-1', 'p-william', 2),
 ('f-2', 'p-nell', 1),   ('f-2', 'p-robert', 2),
 ('f-3', 'p-ruth', 1),
 ('f-4', 'p-anne', 1),   ('f-4', 'p-david', 2);
