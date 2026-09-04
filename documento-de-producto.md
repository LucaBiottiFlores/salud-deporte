# App Salud y Deporte — Documento de Producto

> Basado en `001.idea-salud-deporte.md`
> Versión: 0.3 · Fecha: 2026-09-04

## 1. Visión

Una app que acompaña al usuario en sus actividades de salud y deporte, empezando
por el gimnasio y escalando de forma incremental hacia otros aspectos de su salud.

## 2. Problema y oportunidad

Las personas que entrenan por intervalos (HIIT/Tabata) necesitan un temporizador
sencillo y configurable, sin depender de apps genéricas recargadas de funciones.
La oportunidad es partir con una herramienta mínima y valiosa, y luego crecer
hacia nutrición, descanso, seguimiento y otros módulos de salud.

## 3. Objetivo de la primera versión (MVP)

Entregar un **temporizador de intervalos (Tabata) totalmente configurable**, con
tres parámetros:

- Tiempo de **trabajo** (ejercicio)
- Tiempo de **descanso**
- **Número de series**

## 4. Usuarios

- Personas que hacen HIIT/Tabata en gimnasio o en casa.
- Perfil: no técnico, busca simplicidad y usar la app con el celular mientras entrena.

## 5. Requerimientos funcionales

### 5.1 Configuración de intervalos

- **RF1** — El usuario puede definir el tiempo de trabajo, en segundos.
- **RF2** — El usuario puede definir el tiempo de descanso, en segundos.
- **RF3** — El usuario puede definir el número de series.
- **RF4** — La app ofrece valores por defecto sugeridos (ej. 30 s trabajo, 15 s descanso, 5 series).

### 5.2 Ejecución del temporizador

- **RF5** — Botones de **iniciar**, **pausar/reanudar** y **salir** (volver a la configuración).
- **RF6** — La app alterna automáticamente entre intervalos de trabajo y descanso.
- **RF7** — Regla de intercalado: con N series se ejecutan **N intervalos de trabajo
  y N−1 de descanso** (tras la última serie no hay descanso).
- **RF8** — Indicador visual claro del estado actual (trabajando / descansando) y del progreso.
- **RF9** — Contador de series ("Serie 3 de 5").
- **RF10** — Aviso de finalización al completar todas las series (visual y sonoro).

### 5.3 Avisos y cuenta regresiva

- **RF11** — Antes de la primera serie se ejecuta una cuenta regresiva de 10 segundos.
- **RF12** — En los últimos 3 segundos de cada intervalo (cuenta regresiva, trabajo y
  descanso) suena una señal de cuenta regresiva "3, 2, 1", al estilo de los juegos de
  carreras pero con un sonido propio.
- **RF13** — Al comenzar cada intervalo de trabajo suena un "GO" distintivo.
- **RF14** — A mitad del intervalo de trabajo, una voz avisa: "Llevas la mitad".
- **RF15** — Cuando quedan 10 segundos de trabajo, una voz avisa: "10 segundos".
- **RF16** — Al comenzar cada intervalo de descanso suena un tono suave distintivo.

## 6. Reglas de negocio / lógica

- Ejemplo: 30 s de trabajo, 15 s de descanso, 5 series →
  `trabajo(30) → descanso(15) → … → trabajo(30) [final]`.
  Total: 5 intervalos de trabajo + 4 de descanso.
- Fórmula: `series_trabajo = N` · `series_descanso = N − 1`.
- Validación: tiempos y series deben ser enteros positivos (mayores a 0). Sin límites máximos.
- La cuenta regresiva de 10 s solo ocurre antes de la primera serie; las siguientes series
  se anuncian con los últimos 3 s del descanso anterior.

## 7. Casos de uso

- **CU1** — Configurar y correr una sesión completa.
- **CU2** — Pausar y reanudar una sesión en curso.
- **CU3** — Salir de una sesión en curso y volver a configurar.
- **CU4** — Modificar parámetros y arrancar una nueva sesión.

## 8. Requerimientos no funcionales

- **Usabilidad**: operable con una mano en el gimnasio; controles grandes y legibles.
- **Rendimiento**: cuenta regresiva precisa (segundos), sin retrasos perceptibles.
- **Accesibilidad**: buen contraste, tamaño de fuente ajustable, soporte de lector de pantalla.
- **Plataforma**: web responsive / PWA, mobile-first e instalable en la pantalla de inicio del celular.
- **Pantalla**: se mantiene encendida durante la sesión (Wake Lock).

## 9. Fuera de alcance (v1)

- Cuentas de usuario y login.
- Historial de sesiones y estadísticas.
- Módulos de nutrición, sueño u otros aspectos de salud.
- Planes de entrenamiento predefinidos (más allá de los valores por defecto).

## 10. Roadmap

- **Iteración 2**: vibración y guardar configuraciones.
- **Iteración 3**: historial de sesiones.
- **Iteración 4**: nuevos módulos de salud (agua, sueño, nutrición, etc.).

## 11. Criterios de aceptación (v1)

- Con 30/15/5, la app ejecuta 5 intervalos de trabajo y 4 de descanso, y finaliza
  justo al terminar la última serie de trabajo.
- El temporizador muestra cuenta regresiva y cambia de estado automáticamente.
- Los parámetros se validan (no se aceptan tiempos en 0 ni series menores a 1).
- Antes de la primera serie hay una cuenta regresiva de 10 s, y los últimos 3 s de
  cada intervalo emiten la señal de cuenta regresiva.

## 12. Decisiones tomadas

- **Plataforma**: web/PWA (mobile-first). Las versiones nativas se evalúan más adelante,
  reutilizando el código con Capacitor.
- **Sonido**: incluido en la v1, con tonos simples y suaves.
- **Voz**: avisos hablados ("Llevas la mitad", "10 segundos") mediante síntesis de voz del navegador.
- **Límites**: sin límites máximos para series ni tiempos (solo enteros positivos).
- **Idioma de la interfaz**: español.
- **Estilo visual**: claro y minimalista, con colores diferenciados para trabajo (índigo),
  descanso (verde) y cuenta regresiva (ámbar).
