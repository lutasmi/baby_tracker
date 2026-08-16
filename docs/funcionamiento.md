# Cómo funciona la aplicación

Qué hace cada pantalla, qué muestra cada cifra y con qué reglas se calcula.
Para el modelo de datos —pestañas y columnas— está
[modelo-de-datos.md](modelo-de-datos.md); para la API,
[api.md](api.md).

## Índice

- [Conceptos que atraviesan toda la aplicación](#conceptos-que-atraviesan-toda-la-aplicación)
- [Pantalla principal](#pantalla-principal)
- [Registrar y corregir](#registrar-y-corregir)
- [Cronología](#cronología)
- [Evolución](#evolución)
- [Datos del bebé](#datos-del-bebé)
- [Acceso y sesión](#acceso-y-sesión)
- [Comportamiento en fallo](#comportamiento-en-fallo)

## Conceptos que atraviesan toda la aplicación

### Los dos calendarios

Un **día natural** va de las 00:00 a las 23:59. Un **día de vida** es un periodo
de 24 h contado desde el instante exacto del nacimiento: con un nacimiento el 9
de agosto a las 22:40, el día de vida 1 va del 9 a las 22:40 al 10 a las 22:40.

Los dos se pueden elegir en la pantalla principal y en la cronología. La
elección se guarda en el navegador (`localStorage`) y vale para las dos
pantallas. Sin fecha de nacimiento no hay días de vida: la cronología muestra
días naturales y la pantalla principal invita a rellenarla en Ajustes.

Un registro **pertenece al periodo en el que empieza**. Una toma de 22:30 a
23:10 pertenece entera al periodo en el que empezó, tanto si cruza la
medianoche como el aniversario horario del nacimiento.

### Qué cuenta como toma y qué como caca

Dos cortes se aplican **en todas las pantallas y contadores**:

| Registro | Cuenta como | Regla |
|---|---|---|
| Pecho ≥ 5 min, sin biberón | Toma | |
| Pecho < 5 min, sin biberón | Hidratación | |
| Cualquier toma con biberón (ml > 0) | Toma | La cantidad manda sobre el tiempo |
| Toma sin nada anotado | Toma | Solo puede darse editando la hoja a mano |
| Pañal con caca de consistencia `Pedete` | Pedete | |
| Pañal con caca de cualquier otra consistencia, o sin anotar | Caca | |

Consecuencias en cadena, todas deliberadas:

- Los **contadores** de la pantalla principal, el **resumen** de la cronología y
  la **evolución** cuentan tomas y cacas de verdad; hidrataciones y pedetes
  tienen su propio contador.
- El **"hace cuánto"** de la última toma y de la última caca no se reinicia con
  una hidratación ni con un pedete.
- El **hueco entre tomas** de la cronología solo se mide entre tomas de verdad.
- Los **minutos de pecho y los mililitros se suman siempre**, también los de una
  hidratación: se ha tomado, aunque fuera un rato.
- El **último pañal** sí incluye el que solo llevaba gases: es un pañal que ha
  habido que cambiar.

El umbral son 5 minutos, en `HYDRATION_MAX_MIN`
([lifeday.ts](../web/src/lib/lifeday.ts) y [Logic.js](../apps-script/Logic.js)).

### Sueño sin cerrar

Un sueño puede guardarse sin hora de fin. Eso **no** significa que el bebé siga
dormido: puede ser un cronómetro que nadie detuvo.

- Mientras esté abierto, la pantalla principal muestra una barra para cerrarlo
  de un toque, con el fin en el momento de pulsar.
- Pasadas **14 horas** abierto se considera un olvido: deja de contar en las
  horas dormidas, la franja lo dibuja como un instante en lugar de teñir medio
  día, y la barra pasa a ofrecer corregirlo a mano en vez de cerrarlo "ahora",
  que guardaría un sueño que no ocurrió.
- Solo puede haber **un sueño abierto a la vez**; el backend lo garantiza y
  devuelve el error `ACTIVE_SLEEP` si se intenta abrir otro.

### Horas

Todo se guarda y se muestra en hora de Madrid (`Europe/Madrid`), sea cual sea
el dispositivo, con el formato `yyyy-MM-dd HH:mm`. Las horas de fin nunca se
inventan: si un registro no la tiene, no se muestra.

## Pantalla principal

De arriba abajo:

**Selector de calendario.** Día de vida o día natural.

**Navegador de tramos.** El título del tramo y, debajo, sus dos extremos con
fecha y hora (`10 ago 22:40 → 11 ago 22:40`). Las flechas retroceden y avanzan
de tramo en tramo; no se puede pasar del tramo en curso ni retroceder antes del
día de vida 1.

**Contadores del tramo.**

```
💧 Pises        💩 Cacas       💨 Pedetes
     4               2              3
 hace 40 min     hace 3 h

3 pañales · el último hace 40 min

┌──────────────────────────────────────┐
│  🍼 Tomas 6         💦 Hidratación 2 │
│  hace 1 h 20 min                     │
│  ────────────────────────────────────│
│  🥛 Leche cuantificable       310 ml │
│  🍼 180 ml fórmula  🥛 130 ml extraída│
│  🤱 25 min de pecho directo           │
└──────────────────────────────────────┘
```

- Las cifras son del tramo que se está mirando.
- El "hace cuánto" es respecto al **último registro global**, no al del tramo, y
  solo se muestra en el tramo en curso.
- Pises, cacas y tomas abren su último registro al pulsarlos.
- La línea de leche cuantificable suma fórmula y leche extraída. Los minutos de
  pecho van aparte y solo aparecen si los hay: del pecho directo no se sabe
  cuántos mililitros ha tomado, y no se convierten.

**Barra de sueño abierto.** Solo aparece si hay uno; ver
[Sueño sin cerrar](#sueño-sin-cerrar).

**Accesos rápidos.** Cinco botones: toma y pañal arriba (los de cada pocas
horas), sueño, baño y peso debajo.

**El tramo de un vistazo.** Una franja de 24 h con cuatro carriles —sueño,
tomas, pises, cacas— donde cada registro se dibuja en su hora: los que duran, como
barra; los puntuales, como punto. Marca dónde estamos ahora y cada hito abre su
registro. Baños y pesadas no tienen carril y se consultan en la cronología; si
el tramo solo tiene de eso, la franja lo dice en vez de quedarse en blanco.
Debajo, si hay sueños registrados, una línea dice si consta dormido o despierto
y desde cuándo.

**Peso.** La última pesada con su fecha, y su variación respecto al peso al
nacer en una pastilla verde (por encima) o roja (por debajo). Se ve siempre,
también mirando tramos pasados, porque es la última que haya, no la del tramo.
Al pulsarla se abre para corregirla.

**Cronología y Evolución.** Los dos accesos al resto de la aplicación.

## Registrar y corregir

Un mismo formulario crea y edita cada tipo, y se llega a él desde los accesos
rápidos, desde cualquier registro de la cronología o desde los contadores de la
pantalla principal. Todos llevan nota opcional y, al editar, botón de eliminar.
La hora la lleva cada tipo a su manera: la toma, dentro de cada elemento.

Los campos que no aplican no se preguntan: la consistencia de la caca solo
aparece si hay caca, y si se desmarca, lo anotado se descarta al guardar.

### Toma

Una toma es **el conjunto de lo que ha pasado dentro de ella**: puede llevar
varias tetadas y varios biberones, y sigue siendo **una sola toma**.

- **Tetadas**: se añaden con "+ Añadir tetada". Cada una tiene pecho (izquierdo,
  derecho, ambos o "no recuerdo"), hora de inicio y hora de fin. Al añadir una
  se propone el pecho contrario al de la anterior, **empezando ahora y con el
  fin un minuto por delante**: se anota al empezar, cuando aún no se sabe
  cuánto va a durar, y se corrige el fin al terminar.
- **Biberones**: se añaden con "+ Añadir biberón". Cada uno tiene tipo (extraída
  o fórmula), cantidad en ml y hora. La hora de fin es opcional: sin ella el
  biberón es puntual ("60 ml de fórmula a las 13:13").
- **El intervalo de la toma y sus totales se derivan de sus elementos**: empieza
  con el primero, acaba con el último, y los minutos de pecho y los mililitros
  son la suma de los suyos. No hay nada que ajustar a mano ni que pueda
  contradecirlos.
- El pecho de la toma es el de sus tetadas: dos lados distintos son "ambos"; si
  alguna quedó sin anotar el resultado es "no recuerdo", salvo que las conocidas
  ya sumen los dos pechos.
- Al registrar una toma nueva, arriba se muestra cuánto hace de la anterior, y
  abajo una frase con lo que se va a guardar.

Una toma nueva se abre repitiendo los biberones de la anterior, con la hora
actual. Las tetadas no se proponen: sus horas serían inventadas.

### Sueño

Tipo (siesta o nocturno), hora de inicio y hora de fin, con la opción "sigue
durmiendo" para dejarlo abierto. Un sueño nuevo se propone empezando una hora
antes de ahora; al marcar "sigue durmiendo", el inicio pasa a ser ahora.

### Pañal

Pis y caca son casillas independientes: un pañal puede llevar las dos. Cada una
con su cantidad opcional (poco, medio, mucho) y la caca además con su
consistencia (pedete, líquida, pastosa, sólida). Un pañal tiene que llevar al
menos una de las dos cosas.

### Baño

Completo o aseo rápido, con hora y duración opcional.

### Peso

Hora y gramos, que es como se lee la báscula; se muestra en kilos.

### Ajustar una hora

Cada campo de hora lleva una fila de atajos que **suman y restan sobre la hora
que hay**, no sobre la actual:

```
−10  −5  −1  [ahora]  +1  +5  +10
```

Pulsar dos veces −10 son veinte minutos menos, así que se puede ir acercando a
la hora buena a golpes sin calcular nada; el salto de un minuto es para
afinar. "ahora" es el único que salta a un
sitio fijo. Para cambios mayores están los selectores de fecha y hora, que
tienen precisión de un minuto.

### La hora de fin sigue a la de inicio

Al mover el inicio de algo que dura —una tetada, un biberón con fin, un
sueño—, el fin se mueve con él en dos casos: cuando es el que se propuso solo
(un minuto después) y cuando el cambio lo dejaría antes del inicio, que no se
podría guardar. **Un fin escrito a mano no se toca**: corregir el inicio de
algo ya terminado no puede borrar lo que costó anotar.

### Reglas de validación

Comunes al formulario y al backend, que las vuelve a comprobar:

- Ninguna hora puede estar en el futuro. Se admite un margen para relojes
  desajustados: 5 minutos en el formulario y 10 en el backend, que es más
  permisivo porque el reloj del móvil no tiene por qué coincidir con el suyo.
- El fin no puede ser anterior al inicio, y nada puede durar más de 24 horas.
- Una toma necesita al menos una tetada o un biberón; cada tetada, hora de fin;
  cada biberón, una cantidad mayor que cero.
- Un pañal necesita pis, caca o las dos cosas. Un peso necesita gramos.

## Cronología

La lista de lo registrado, en tramos.

**Cabecera de cada tramo** (pegajosa al desplazarse): el nombre del tramo, sus
dos extremos y el resumen de lo que hubo dentro: dormido, tomas, leche y
pañales.

**Filtro por tipo.** Chips para ver solo tomas, pañales, sueño, baños o peso; se
pueden combinar. Sin ninguno puesto se ve todo. El resumen de la cabecera y los
huecos entre tomas no cambian al filtrar: describen el tramo, no lo que se está
mirando.

**Orden.** Los tramos van del más reciente arriba al más antiguo abajo, y dentro
de cada tramo, igual: bajando por la lista se retrocede en el tiempo. Donde
cambia la fecha dentro del tramo hay una marca con el día.

Cada fila se coloca por **la hora que enseña**, que no siempre es la de inicio:

| Situación | Hora que se muestra | Marca |
|---|---|---|
| Empieza y acaba dentro del tramo | su inicio | `→ 09:20` |
| Puntual | su hora | |
| Empezó antes del tramo y acaba dentro | **su fin** | `de antes` |
| Se prolonga más allá del tramo | su inicio | `sigue` |
| Sueño sin cerrar | su inicio | `sin cerrar` |

**Huecos entre tomas.** Cada toma dice cuánto pasó desde la anterior, medido de
inicio a inicio, incluso si la anterior es de otro tramo. Las hidrataciones ni
tienen hueco propio ni cuentan como referencia.

**Encadenar tramos.** "↓ Ver anteriores" añade el tramo previo debajo y "↑ Ver
posteriores" el siguiente arriba, sin salir de la pantalla. Cada botón
desaparece cuando no lleva a ninguna parte. Un registro aparece **una sola vez**
aunque se encadenen varios tramos.

**Navegación por fecha.** Flechas y selector de día, que sitúan la cronología en
el tramo que contiene esa fecha.

Cada fila abre su registro para corregirlo, y muestra quién lo anotó.

## Evolución

Los últimos 14 días de vida y todas las pesadas.

**Cuatro métricas**: pises, cacas, leche y peso. Las tres primeras, en barras
comparables por día de vida. La de peso es una gráfica con **eje temporal real**
—cada pesada en su hora, no una por día—, con la línea del peso al nacer
dibujada: verde por encima y roja por debajo. En un segundo eje, la variación en
porcentaje. La escala no empieza en cero, y la gráfica lo advierte.

Debajo, la lista de pesadas con su variación, cada una editable.

## Datos del bebé

Fecha y hora de nacimiento —la hora exacta define los días de vida— y peso al
nacer, que es la referencia de las pesadas. Son **comunes a todos los
usuarios**: viven en la hoja, no en el dispositivo.

Sin fecha de nacimiento la aplicación funciona, pero sin días de vida ni
evolución. Sin peso al nacer se pueden registrar pesadas, pero no su variación.

## Acceso y sesión

Se entra con Google. El backend verifica el token contra Google, comprueba que
ese correo está en la pestaña `Usuarios` con `Activo = TRUE` y emite una sesión
propia de **180 días**, que se guarda en el navegador.

La autorización se comprueba **en cada petición**: poner `Activo = FALSE` en la
hoja revoca el acceso al momento. Si la sesión caduca o se revoca, la aplicación
cierra sesión sola y lo dice.

Cada registro guarda quién lo creó y quién lo modificó por última vez, con sus
horas.

## Comportamiento en fallo

- **Se requiere conexión.** Sin internet aparece un aviso permanente. El service
  worker cachea la aplicación —para que abra al instante— pero no los datos.
- **Los fallos pasajeros se reintentan solos**: hasta dos veces, esperando 0,4 s
  y 1,2 s. Se reintenta lo que puede mejorar —la red, un 500, un 429, un error
  interno del servidor— y no lo que no: validación, sesión o configuración se
  muestran de inmediato. Sin conexión tampoco se insiste.
- **Reintentar nunca duplica.** El identificador lo genera el móvil antes de
  enviar: si la misma petición llega dos veces, la segunda devuelve lo ya
  guardado. Por eso guardar también se puede reintentar sin riesgo.
- **Nada se da por guardado sin confirmación**: el botón queda en "Guardando…"
  hasta que la hoja responde, y un fallo se muestra con el mensaje del backend y
  la opción de reintentar. Apps Script tarda 1-3 s por operación.
- **Un día que no carga se dice**, en lugar de desaparecer de la lista: la
  cronología y la pantalla principal avisan de qué falta y ofrecen reintentar
  solo eso. Lo que sí llegó se pinta igualmente.
- **Un fallo pintando no deja la pantalla en negro**: se muestra qué ocurrió,
  con botones para reintentar o volver al inicio, y el detalle queda en la
  consola. Cambiar de pantalla también lo reinicia.
- **Lo último cargado se pinta al instante** mientras se refresca por detrás, de
  modo que volver a una pantalla no deja la vista en blanco.
- **Borrar es lógico**: la fila se marca en la columna `Eliminado` y deja de
  leerse, pero no desaparece de la hoja.

## Lo que la aplicación no hace

No propone objetivos de alimentación, no valora si un peso es normal, no avisa
de que lleváis mucho sin registrar y no deduce lo que está pasando ahora a
partir de lo que no se ha registrado. Muestra lo anotado y deja el juicio a
quien lo lee.
