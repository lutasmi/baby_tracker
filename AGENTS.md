# AGENTS.md

# Baby Tracker

Este repositorio está pensado para que agentes de IA (Claude Code, Codex o similares) desarrollen la aplicación de forma autónoma.

El objetivo no es generar ejemplos, prototipos o demostraciones. El objetivo es terminar una aplicación completamente funcional y mantenible.

---

# Objetivo

Construir una aplicación web (PWA) para el registro y seguimiento del bebé durante sus primeros años.

La prioridad absoluta es la rapidez de uso.

Registrar cualquier evento debe requerir el mínimo número posible de pulsaciones.

La aplicación será utilizada varias veces al día por padres cansados y normalmente con una sola mano.

Toda decisión debe favorecer esa experiencia.

---

# Principios

Cuando exista una duda entre dos soluciones, elegir siempre la más simple.

No añadir funcionalidades "por si acaso".

No sobreingenierizar.

No crear capas de abstracción innecesarias.

No introducir dependencias que no aporten un beneficio claro.

Mantener el código limpio y fácil de entender.

---

# Filosofía de desarrollo

Pensar primero en el producto.

Después en la arquitectura.

Por último en la implementación.

Cada funcionalidad debe estar completamente terminada antes de comenzar la siguiente.

Evitar dejar trabajo a medias.

---

# Alcance de la V1

La primera versión debe incluir únicamente:

- Sueño
- Alimentación
- Pañales
- Baños
- Cronología diaria
- Dashboard principal
- Estadísticas básicas

Todo lo demás queda fuera salvo que sea imprescindible.

---

# Modelo de datos

Toda la aplicación debe construirse alrededor del concepto de **Evento**.

Cada acción realizada sobre el bebé es un evento.

Ejemplos:

- Inicio de sueño
- Fin de sueño
- Biberón
- Lactancia
- Pañal
- Baño
- Medicación
- Peso

Cada tipo podrá tener atributos propios.

Diseñar el sistema para que añadir un nuevo tipo de evento requiera el mínimo trabajo posible.

---

# Fuente de datos

Google Sheets es la fuente de verdad.

No utilizar una base de datos adicional mientras no exista una necesidad real.

La aplicación leerá y escribirá directamente sobre Google Sheets mediante una API ligera.

Toda la información debe poder editarse manualmente desde Sheets sin romper la aplicación.

---

# Multiusuario

La aplicación debe soportar varios usuarios.

Cada registro debe almacenar:

- usuario
- fecha de creación
- fecha de modificación

En el futuro podrán existir permisos diferentes, pero no forman parte de la V1.

---

# Offline

La V1 requiere conexión a Internet.

No implementar sincronización offline.

La arquitectura debe permitir incorporarla posteriormente sin rehacer la aplicación.

---

# Interfaz

Antes que bonita debe ser rápida.

Reducir al máximo:

- pantallas
- clics
- escritura manual

Priorizar:

- botones grandes
- acciones rápidas
- cronómetros
- autocompletado
- valores por defecto

---

# Dashboard

La pantalla principal debe responder rápidamente a preguntas como:

- ¿Cuánto lleva despierto?
- ¿Cuándo fue la última toma?
- ¿Cuándo fue el último pañal?
- ¿Cuánto ha dormido hoy?
- ¿Qué ocurrió durante las últimas horas?

---

# Calidad

No dar una funcionalidad por terminada hasta que:

- funcione
- sea consistente con el resto de la aplicación
- tenga gestión de errores
- sea fácil de utilizar
- esté integrada en la navegación

---

# Autonomía

El agente tiene autonomía para decidir:

- estructura del proyecto
- arquitectura
- tecnologías
- componentes
- organización del código

Siempre que respete este documento y el README.

---

# Restricciones

No implementar funcionalidades que no aporten valor al usuario.

No desarrollar características pensando en una futura comercialización.

No optimizar prematuramente.

No generar documentación innecesaria.

---

# Cuando exista una duda

Preguntarse siempre:

"¿Hace que registrar un evento sea más rápido?"

Si la respuesta es no, probablemente no pertenece a la V1.

---

# Definición de terminado

La aplicación se considera terminada cuando dos padres puedan utilizarla durante varios días seguidos sin necesitar ninguna otra herramienta para registrar la actividad diaria del bebé.