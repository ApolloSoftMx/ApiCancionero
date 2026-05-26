USE CancioneroCatolico;

CREATE TABLE EsquemaMisa (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    nombre          NVARCHAR(200)  NOT NULL,
    fecha           DATE           NULL,
    descripcion     NVARCHAR(500)  NULL,
    codigo_sala     NVARCHAR(8)    NOT NULL UNIQUE, -- para compartir
    activo          BIT            NOT NULL DEFAULT 1,
    creado_por      INT            NULL REFERENCES Usuario(id),
    creado_en       DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    modificado_en   DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME()
);

CREATE TABLE EsquemaCancion (
    id              INT IDENTITY(1,1) PRIMARY KEY,
    esquema_id      INT NOT NULL REFERENCES EsquemaMisa(id) ON DELETE CASCADE,
    cancion_id      INT NOT NULL REFERENCES Cancion(id),
    orden           INT NOT NULL DEFAULT 0,
    nota_director   NVARCHAR(300) NULL,  -- nota especifica para esta misa
    seccion_id      INT NULL REFERENCES SeccionMisa(id)
);

CREATE INDEX IX_EsquemaCancion_EsquemaId ON EsquemaCancion(esquema_id);

-- Tabla para sincronización en tiempo real
CREATE TABLE EsquemaSesion (
    esquema_id      INT NOT NULL REFERENCES EsquemaMisa(id) ON DELETE CASCADE,
    cancion_actual  INT NOT NULL DEFAULT 0,  -- índice de la canción actual
    actualizado_en  DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    PRIMARY KEY (esquema_id)
);