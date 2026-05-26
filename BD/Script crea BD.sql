-- ============================================================
--  CANCIONERO CATÓLICO — Esquema SQL Server
--  Paso 1 de 7
-- ============================================================

USE master;
GO

-- Crea la base de datos si no existe
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'CancioneroCatolico')
BEGIN
    CREATE DATABASE CancioneroCatolico
        COLLATE Latin1_General_CI_AI;   -- sin distinción mayús/acento
END
GO

USE CancioneroCatolico;
GO

-- ============================================================
--  CATÁLOGOS / TABLAS DE REFERENCIA
-- ============================================================

-- Secciones de la misa (Entrada, Gloria, Ofertorio, Comunión…)
CREATE TABLE SeccionMisa (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    nombre      NVARCHAR(80)  NOT NULL UNIQUE,
    orden       TINYINT       NOT NULL DEFAULT 0,   -- para ordenar en UI
    descripcion NVARCHAR(300) NULL
);

-- Tipos de canción (Alabanza, Adoración, Penitencial, Mariana…)
CREATE TABLE TipoCancion (
    id          INT IDENTITY(1,1) PRIMARY KEY,
    nombre      NVARCHAR(80)  NOT NULL UNIQUE,
    descripcion NVARCHAR(300) NULL
);

-- Tonalidades musicales (Do mayor, La menor…)
CREATE TABLE Tonalidad (
    id      INT IDENTITY(1,1) PRIMARY KEY,
    nombre  NVARCHAR(20) NOT NULL UNIQUE   -- "Do", "Re", "Mi" …
);

-- Usuarios del sistema (músicos / administradores)
CREATE TABLE Usuario (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    nombre          NVARCHAR(100) NOT NULL,
    email           NVARCHAR(150) NOT NULL UNIQUE,
    password_hash   NVARCHAR(256) NOT NULL,
    rol             NVARCHAR(20)  NOT NULL DEFAULT 'editor'   -- 'admin' | 'editor'
        CHECK (rol IN ('admin','editor')),
    activo          BIT           NOT NULL DEFAULT 1,
    creado_en       DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);

-- ============================================================
--  TABLA PRINCIPAL: CANCIÓN
-- ============================================================

CREATE TABLE Cancion (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    titulo          NVARCHAR(200)  NOT NULL,
    autor           NVARCHAR(150)  NULL,
    fuente          NVARCHAR(200)  NULL,          -- libro, álbum, URL de origen
    tonalidad_id    INT            NULL REFERENCES Tonalidad(id),
    bpm             SMALLINT       NULL,           -- tempo referencial
    notas           NVARCHAR(1000) NULL,           -- notas libres del músico
    activo          BIT            NOT NULL DEFAULT 1,
    creado_por      INT            NULL REFERENCES Usuario(id),
    creado_en       DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    modificado_en   DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);

-- ============================================================
--  RELACIONES N:N  (una canción puede tener varias clasificaciones)
-- ============================================================

-- Canción ↔ Sección de Misa  (puede usarse en múltiples secciones)
CREATE TABLE CancionSeccion (
    cancion_id      INT NOT NULL REFERENCES Cancion(id)     ON DELETE CASCADE,
    seccion_id      INT NOT NULL REFERENCES SeccionMisa(id) ON DELETE CASCADE,
    PRIMARY KEY (cancion_id, seccion_id)
);

-- Canción ↔ Tipo de Canción
CREATE TABLE CancionTipo (
    cancion_id      INT NOT NULL REFERENCES Cancion(id)     ON DELETE CASCADE,
    tipo_id         INT NOT NULL REFERENCES TipoCancion(id) ON DELETE CASCADE,
    PRIMARY KEY (cancion_id, tipo_id)
);

-- ============================================================
--  LETRAS Y ACORDES
--  Modelo: la letra se guarda párrafo a párrafo.
--  Cada párrafo tiene líneas; cada línea tiene segmentos {texto, acorde}.
--  Se serializa como JSON en una sola columna para máxima flexibilidad.
-- ============================================================

CREATE TABLE LetraCancion (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    cancion_id      INT           NOT NULL REFERENCES Cancion(id) ON DELETE CASCADE,
    version_nombre  NVARCHAR(50)  NOT NULL DEFAULT 'original',  -- permite guardar versiones (tono diferente, etc.)
    es_principal    BIT           NOT NULL DEFAULT 1,
    -- JSON con estructura: [ { tipo:'estrofa'|'coro'|'puente', etiqueta:'Estrofa 1',
    --   lineas: [ { segmentos: [ { texto:'Cuan-do', acorde:'Am' }, … ] } ] } ]
    contenido_json  NVARCHAR(MAX) NOT NULL
        CHECK (ISJSON(contenido_json) = 1),
    creado_en       DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    modificado_en   DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME()
);

-- ============================================================
--  ÍNDICES PARA BÚSQUEDA RÁPIDA
-- ============================================================

CREATE INDEX IX_Cancion_Titulo     ON Cancion(titulo);
CREATE INDEX IX_Cancion_Autor      ON Cancion(autor);
CREATE INDEX IX_LetraCancion_CID   ON LetraCancion(cancion_id);

-- Búsqueda full-text (requiere Full-Text Search instalado en SQL Server Express)
IF NOT EXISTS (SELECT * FROM sys.fulltext_catalogs WHERE name = 'ftc_cancionero')
    CREATE FULLTEXT CATALOG ftc_cancionero AS DEFAULT;

CREATE FULLTEXT INDEX ON Cancion(titulo, autor)
    KEY INDEX PK__Cancion__3213E83F00000000   -- ajusta al nombre real del PK
    ON ftc_cancionero;
GO

-- ============================================================
--  DATOS INICIALES
-- ============================================================

-- Secciones de la Misa (orden litúrgico)
INSERT INTO SeccionMisa (nombre, orden) VALUES
    ('Entrada / Procesión',     1),
    ('Acto Penitencial',        2),
    ('Gloria',                  3),
    ('Liturgia de la Palabra',  4),
    ('Salmo Responsorial',      5),
    ('Aclamación al Evangelio', 6),
    ('Ofertorio',               7),
    ('Santo',                   8),
    ('Consagración / Elevación',9),
    ('Padre Nuestro',          10),
    ('Comunión',               11),
    ('Acción de Gracias',      12),
    ('Salida',                 13),
    ('Adoración',              14),  -- fuera de misa
    ('General / Varios',       99);

-- Tipos de canción
INSERT INTO TipoCancion (nombre) VALUES
    ('Alabanza'),
    ('Adoración'),
    ('Penitencial'),
    ('Acción de Gracias'),
    ('Mariana'),
    ('Adviento'),
    ('Navidad'),
    ('Cuaresma / Pascua'),
    ('Ordinario'),
    ('Juvenil');

-- Tonalidades
INSERT INTO Tonalidad (nombre) VALUES
    ('Do mayor'),  ('Do menor'),
    ('Re mayor'),  ('Re menor'),
    ('Mi mayor'),  ('Mi menor'),
    ('Fa mayor'),  ('Fa menor'),
    ('Sol mayor'), ('Sol menor'),
    ('La mayor'),  ('La menor'),
    ('Si mayor'),  ('Si menor');
GO

INSERT into Tonalidad(nombre) values('Do# mayor')
INSERT into Tonalidad(nombre) values('Do# menor')
INSERT into Tonalidad(nombre) values('Mib mayor')
INSERT into Tonalidad(nombre) values('Mib menor')
INSERT into Tonalidad(nombre) values('Fa# mayor')
INSERT into Tonalidad(nombre) values('Fa# menor')
INSERT into Tonalidad(nombre) values('Ab mayor')
INSERT into Tonalidad(nombre) values('Ab menor')
INSERT into Tonalidad(nombre) values('Sib mayor')
INSERT into Tonalidad(nombre) values('Sib menor')
GO

-- ============================================================
--  VISTA ÚTIL: canciones con sus clasificaciones
-- ============================================================

CREATE VIEW vw_CancionDetalle AS
SELECT
    c.id,
    c.titulo,
    c.autor,
    c.fuente,
    t.nombre                                    AS tonalidad,
    c.bpm,
    c.notas,
    c.activo,
    -- secciones concatenadas
    STUFF((
        SELECT ', ' + sm.nombre
        FROM CancionSeccion cs
        JOIN SeccionMisa sm ON sm.id = cs.seccion_id
        WHERE cs.cancion_id = c.id
        FOR XML PATH(''), TYPE).value('.','NVARCHAR(MAX)'), 1, 2, '')  AS secciones,
    -- tipos concatenados
    STUFF((
        SELECT ', ' + tc.nombre
        FROM CancionTipo ct
        JOIN TipoCancion tc ON tc.id = ct.tipo_id
        WHERE ct.cancion_id = c.id
        FOR XML PATH(''), TYPE).value('.','NVARCHAR(MAX)'), 1, 2, '')  AS tipos
FROM Cancion c
LEFT JOIN Tonalidad t ON t.id = c.tonalidad_id;
GO

PRINT '✅  Esquema CancioneroCatolico creado correctamente.';

-- ============================================================
--  FIX: Full-Text Search en tabla Cancion
--  Ejecutar DESPUÉS de 01_schema_cancionero.sql
--  (o reemplazar la sección de FTS en el script original)
-- ============================================================

USE CancioneroCatolico;
GO

-- 1. Índice único explícito con nombre fijo sobre la PK
--    (necesario para que FTS pueda usarlo como clave)
CREATE UNIQUE INDEX UX_Cancion_Id
    ON Cancion(id);
GO

-- 2. Catálogo Full-Text (solo si no existe ya)
IF NOT EXISTS (SELECT * FROM sys.fulltext_catalogs WHERE name = 'ftc_cancionero')
    CREATE FULLTEXT CATALOG ftc_cancionero AS DEFAULT;
GO

-- 3. Índice Full-Text usando el índice único que acabamos de crear
CREATE FULLTEXT INDEX ON Cancion(titulo, autor)
    KEY INDEX UX_Cancion_Id          -- nombre exacto, sin ambigüedad
    ON ftc_cancionero
    WITH CHANGE_TRACKING AUTO;       -- se actualiza solo al insertar/editar
GO

PRINT '✅  Full-Text Index creado correctamente sobre UX_Cancion_Id.';

