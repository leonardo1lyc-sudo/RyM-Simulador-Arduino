# Publicar RyM Simu en Google Play

La app es una *Trusted Web Activity*: abre https://banco-uno.vercel.app a pantalla completa con Chrome.
Cada vez que se publica la web en Vercel, la app ya muestra la versión nueva. Sólo hace falta subir
otra versión a Play si cambia algo de la carpeta `android/` (nombre, ícono, colores).

- Paquete: `com.rym.simu` (no se puede cambiar después de la primera subida).
- Política de privacidad: https://banco-uno.vercel.app/privacidad.html
- Verificación del dominio: `web/.well-known/assetlinks.json`

## 1. Llave de firma y secretos de GitHub

La llave de subida (`banco-uno-subida.jks`) y sus datos están en `LEEME-GUARDAR.txt`, fuera del repositorio.
Guardalos en un lugar seguro y cargá estos cuatro secretos en
GitHub → Settings → Secrets and variables → Actions → New repository secret:

| Secreto | Valor |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | contenido de `banco-uno-subida.jks.base64.txt` |
| `ANDROID_KEYSTORE_PASSWORD` | la contraseña |
| `ANDROID_KEY_ALIAS` | `subida` |
| `ANDROID_KEY_PASSWORD` | la contraseña |

## 2. Generar el AAB

GitHub → Actions → **App Android** → *Run workflow*. Al terminar, en *Artifacts* se descarga un zip con:

- `app-release.aab`: el que se sube a Play.
- `app-release.apk`: para instalar directo en un celular y probar.

## 3. Cuenta de desarrollador

https://play.google.com/console → pago único de 25 USD y verificación de identidad (DNI y, si es cuenta
de organización, datos de la empresa).

## 4. Crear la app en Play Console

1. *Crear app* → nombre "RyM Simu", idioma español, app gratuita.
2. *Contenido de la app*: política de privacidad (URL de arriba), anuncios = no, acceso = sin restricciones,
   clasificación de contenido (cuestionario: app educativa, sin contenido sensible),
   público objetivo, y *Seguridad de los datos*: "no recopila ni comparte datos" (ver la política).
3. *Ficha de Play Store*: descripción corta y larga, ícono 512×512 (`android/play-store/icono-512.png`),
   gráfico de funciones 1024×500 y al menos 2 capturas del celular.

## 5. Prueba cerrada (obligatoria para cuentas personales nuevas)

*Pruebas → Prueba cerrada* → subir el AAB → agregar al menos 12 testers (correos de Gmail) que tengan
la app instalada durante 14 días seguidos. Después se habilita pedir el acceso a *Producción*.

## 6. Huella de Google en assetlinks.json (importante)

Play vuelve a firmar la app con su propia llave (*Play App Signing*). Para que la app abra sin la barra
del navegador, hay que agregar esa huella:

Play Console → *Prueba y lanzamiento → Configuración → Integridad de la app → Firma de apps* →
copiar "Huella digital del certificado SHA-256" de la **llave de firma de apps** y sumarla a la lista
`sha256_cert_fingerprints` de `web/.well-known/assetlinks.json` (dejando también la que ya está).
Con el push a main, Vercel la publica.

## Versiones nuevas

El número de versión (`versionCode`) sale del número de ejecución del workflow, así cada AAB nuevo sube sin
conflicto. Para cambiar nombre, colores o ícono, editá `android/app/build.gradle` y los archivos de `res/`.
