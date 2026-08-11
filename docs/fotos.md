> Evolutivo anotado, **no implementado**. Se analizó al preguntar si se podían
> guardar fotos —por ejemplo de un pañal— desde la aplicación.

# Fotos en los registros

## Se puede, pero la versión obvia tiene un problema serio

Google Sheets admite imágenes dentro de una celda, y Apps Script sabe ponerlas:

```js
var imagen = SpreadsheetApp.newCellImage().setSourceUrl(url).build();
rango.setValue(imagen);
```

El flujo sería: hacer la foto en el móvil → reducirla → mandarla al backend →
guardarla en Drive → poner la imagen en la celda del registro.

**El problema está en `setSourceUrl`.** Sheets va a buscar la imagen a esa
dirección y necesita poder leerla sin sesión, así que el archivo de Drive tiene
que quedar como "cualquiera con el enlace". No basta con que la hoja sea tuya.

Eso significa dejar cada foto del pañal de un bebé en una URL pública. Son
enlaces imposibles de adivinar, pero públicos al fin y al cabo, y una vez
publicados no hay forma de saber quién los ha visto. Para este tipo de
contenido, es un precio que no compensa una miniatura en la hoja.

## La alternativa segura

Guardar en la hoja solo el **identificador del archivo de Drive**, en una
columna de texto, y que la foto se vea **dentro de la aplicación**, que sí
tiene la sesión del usuario. El archivo se comparte únicamente con quien deba
verlo y nada queda expuesto.

El precio: en la hoja verías un código en lugar de una miniatura. Se pierde
justo lo que hacía atractiva la idea original, así que conviene decidir con eso
delante.

## Lo que haría falta en cualquiera de las dos versiones

1. **Reducir la foto en el móvil antes de subirla.** Una foto de 4 MB por un
   backend que ya tarda 1-3 segundos sería inaceptable. Reescalada a 800 px de
   lado mayor y guardada como JPEG con calidad media quedan unos 150 KB, que sí
   es viable. Se hace con un `<canvas>` en el navegador, sin dependencias.
2. **Una acción nueva en la API** que reciba la imagen en base64, la guarde con
   `DriveApp.createFile(blob)` y devuelva su identificador.
3. **Una columna nueva** en la pestaña del tipo que la use (`Foto` en
   `Panales`, por ejemplo), más su descriptor en `RECORD_TYPES`. Ver
   [modelo-de-datos.md](modelo-de-datos.md#cómo-añadir-un-campo-a-un-tipo).
4. **Interfaz**: botón de cámara en el formulario, miniatura en el registro y
   visor a pantalla completa.
5. **Borrado coordinado**: al eliminar un registro con foto, el archivo de
   Drive se queda huérfano si nadie lo limpia.

## Cuánto ocupa

15 GB gratuitos compartidos entre Drive, Gmail y Fotos. A 150 KB por imagen
caben decenas de miles: el espacio no es la limitación.

## Antes de construirlo, considera el atajo

Si el objetivo es **enseñárselo al pediatra**, hacer la foto con la cámara del
teléfono y escribir en la nota del pañal "foto en el carrete a las 14:08"
resuelve el caso con cero trabajo y cero exposición. Merece la pena probar eso
unos días antes de decidir que hace falta la integración.
