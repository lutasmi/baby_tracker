> Especificación original del producto (contrato de la V1). Las instrucciones
> de instalación y despliegue reales están en el README de la raíz.

# Baby Tracker

Aplicación web móvil para registrar de forma rápida y compartida la actividad diaria de un bebé.

El objetivo no es construir una demo ni un prototipo visual. El objetivo es entregar una aplicación funcional, usable y desplegable que pueda utilizarse desde el móvil desde el primer día.

## Objetivo del producto

La aplicación debe permitir que varias personas registren y consulten, de forma sencilla, los principales eventos del día del bebé:

- Sueño
- Tomas
- Pañales
- Baños
- Cronología diaria

Cada registro debe guardar automáticamente quién lo creó y cuándo se creó.

La prioridad principal es la velocidad de uso. Registrar un evento habitual debe requerir el menor número posible de pasos y, cuando sea razonable, poder completarse en menos de cinco segundos.

## Principios de diseño

1. **Uso móvil primero**  
   La aplicación debe estar pensada principalmente para utilizarse desde un teléfono móvil.

2. **Registro inmediato**  
   Las acciones más frecuentes deben estar disponibles desde la pantalla principal.

3. **Interfaz sencilla**  
   Evitar menús innecesarios, configuraciones complejas y campos que no aporten valor real.

4. **Datos accesibles**  
   Google Sheets será la fuente de verdad de la aplicación.

5. **Uso compartido**  
   Varias personas deben poder utilizar la aplicación y cada evento debe quedar asociado al usuario que lo registra.

6. **Evolución incremental**  
   La primera versión debe ser pequeña y completa. Las funcionalidades futuras deben poder añadirse sin rehacer la aplicación.

## Alcance de la primera versión

### 1. Autenticación y usuarios

La aplicación debe permitir:

- Inicio de sesión con Google.
- Acceso únicamente a usuarios autorizados.
- Identificación del usuario en cada registro.
- Visualización del nombre del usuario que creó cada evento.

La lista de usuarios autorizados puede mantenerse inicialmente en una pestaña específica de Google Sheets.

### 2. Pantalla principal

La pantalla principal debe mostrar:

- Tiempo que el bebé lleva despierto o dormido.
- Última toma.
- Último pañal.
- Horas dormidas durante el día.
- Acceso rápido a registrar:
  - Sueño
  - Toma
  - Pañal
  - Baño
- Acceso a la cronología del día.

La pantalla debe priorizar la información útil en el momento actual, no estadísticas históricas complejas.

### 3. Registro de sueño

Debe permitir:

- Iniciar un periodo de sueño.
- Finalizar un periodo de sueño activo.
- Registrar manualmente un sueño pasado.
- Indicar si es siesta o sueño nocturno.
- Guardar fecha y hora de inicio.
- Guardar fecha y hora de finalización.
- Calcular automáticamente la duración.
- Añadir una nota opcional.
- Registrar qué usuario creó o cerró el evento.

La aplicación debe impedir que existan dos periodos de sueño activos al mismo tiempo.

### 4. Registro de tomas

Debe permitir registrar:

#### Biberón

- Hora.
- Cantidad tomada.
- Tipo de leche:
  - Materna
  - Fórmula
  - Mixta
- Nota opcional.

#### Lactancia

- Hora de inicio.
- Hora de fin o duración.
- Pecho izquierdo, derecho o ambos.
- Nota opcional.

No deben mostrarse campos de lactancia cuando se registra un biberón ni campos de biberón cuando se registra lactancia.

### 5. Registro de pañales

Debe permitir registrar:

- Hora.
- Tipo:
  - Pipí
  - Caca
  - Ambos
- Consistencia opcional:
  - Líquida
  - Pastosa
  - Sólida
- Nota opcional.

La consistencia solo debe mostrarse cuando el registro incluya caca.

### 6. Registro de baños

Debe permitir registrar:

- Hora.
- Tipo de baño.
- Duración opcional.
- Nota opcional.

La primera versión puede incluir dos tipos:

- Baño completo
- Aseo rápido

### 7. Cronología diaria

Debe existir una vista cronológica que muestre todos los eventos del día ordenados por hora.

Cada elemento debe mostrar, como mínimo:

- Hora.
- Tipo de evento.
- Resumen del registro.
- Usuario que lo registró.

Debe permitirse:

- Cambiar de fecha.
- Editar un registro.
- Eliminar un registro con confirmación.

### 8. Edición y corrección

Todos los registros deben poder editarse posteriormente.

La aplicación debe guardar:

- Fecha de creación.
- Usuario creador.
- Fecha de última modificación.
- Usuario que realizó la última modificación.

No es necesario implementar un historial completo de versiones en la primera versión.

## Google Sheets como fuente de verdad

Google Sheets será el sistema principal de almacenamiento.

La aplicación no debe utilizar Supabase ni otra base de datos como fuente maestra en la primera versión.

La arquitectura puede utilizar Google Apps Script como capa de acceso entre la aplicación y Google Sheets.

### Requisitos

- Toda la información persistente debe almacenarse en Google Sheets.
- La estructura de datos debe ser tabular, legible y explotable directamente.
- No deben guardarse datos críticos únicamente en el navegador.
- Las escrituras deben evitar duplicidades.
- Cada registro debe tener un identificador único estable.
- Las fechas deben guardarse en un formato consistente.
- La zona horaria será `Europe/Madrid`.

### Estructura recomendada del archivo

El agente puede mejorar esta estructura si existe una alternativa más simple y robusta, pero debe mantener Google Sheets como fuente de verdad.

#### Hoja `Usuarios`

- `Usuario_ID`
- `Email`
- `Nombre`
- `Activo`
- `Rol`
- `Fecha_Alta`

#### Hoja `Eventos`

- `Evento_ID`
- `Tipo_Evento`
- `Fecha`
- `Hora_Inicio`
- `Hora_Fin`
- `Duracion_Minutos`
- `Subtipo`
- `Cantidad`
- `Unidad`
- `Detalle_1`
- `Detalle_2`
- `Notas`
- `Creado_Por`
- `Creado_En`
- `Modificado_Por`
- `Modificado_En`
- `Eliminado`

Se prefiere una única tabla de eventos frente a una hoja diferente por cada tipo, siempre que esto no complique de forma significativa la lectura, validación o mantenimiento.

## Arquitectura esperada

La solución debe ser sencilla y mantenible.

Arquitectura recomendada para la primera versión:

- Frontend web responsive o PWA.
- Autenticación con Google.
- Google Apps Script como API.
- Google Sheets como fuente de verdad.
- Despliegue accesible desde móvil.

El agente tiene autonomía para elegir el framework y las librerías, siempre que:

- No añada complejidad innecesaria.
- La aplicación pueda desplegarse con instrucciones claras.
- No requiera infraestructura de pago para funcionar en el uso previsto.
- Las claves y secretos no se incluyan en el repositorio.

## Funcionamiento con conexión

La primera versión funcionará únicamente con conexión a internet.

No debe implementarse sincronización offline en esta fase.

La interfaz debe gestionar correctamente:

- Pérdida de conexión.
- Error de escritura.
- Reintento manual.
- Confirmación de que el registro se ha guardado.

Nunca debe mostrarse un registro como guardado si la escritura en Google Sheets no ha finalizado correctamente.

## Funcionalidad futura registrada

La arquitectura debe dejar preparado el camino para incorporar en el futuro:

- Funcionamiento sin conexión.
- Cola local de registros pendientes.
- Sincronización automática al recuperar conexión.
- Resolución de conflictos.
- Recordatorios.
- Estadísticas semanales y mensuales.
- Ventanas de sueño.
- Medicación.
- Crecimiento.
- Exportaciones.
- Registro de hitos.

Estas funcionalidades no forman parte de la primera versión y no deben retrasar su entrega.

## Experiencia de usuario

La aplicación debe utilizar:

- Botones grandes.
- Acciones principales visibles.
- Pocos campos por pantalla.
- Valores predeterminados razonables.
- Fecha y hora actuales por defecto.
- Confirmaciones breves y claras.
- Formularios adaptados al tipo de evento.

Debe evitar:

- Formularios largos.
- Tablas pensadas para escritorio.
- Navegación profunda.
- Configuración técnica visible para el usuario.
- Estadísticas sin utilidad práctica.

## Requisitos de calidad

Antes de considerar terminada la primera versión, deben cumplirse estos puntos:

- La aplicación funciona correctamente en móvil.
- Dos usuarios pueden registrar información sobre el mismo bebé.
- Cada registro identifica al usuario que lo creó.
- Los datos quedan almacenados correctamente en Google Sheets.
- Los registros pueden crearse, editarse y eliminarse.
- La cronología diaria refleja los cambios correctamente.
- No se generan duplicados al repetir una petición.
- Los errores de red se muestran de forma comprensible.
- Las credenciales no están versionadas.
- Existe documentación suficiente para instalar, configurar y desplegar.
- Existe un conjunto mínimo de pruebas para la lógica crítica.

## Criterio de terminado

La aplicación no estará terminada cuando simplemente compile o muestre las pantallas.

Se considerará terminada cuando:

1. Pueda desplegarse siguiendo la documentación.
2. Permita autenticar usuarios autorizados.
3. Permita registrar todos los eventos incluidos en el alcance.
4. Guarde los datos en Google Sheets.
5. Muestre una cronología diaria fiable.
6. Permita corregir registros.
7. Sea cómoda de utilizar desde un teléfono móvil.
8. Gestione errores básicos sin perder información silenciosamente.

## Instrucciones para el agente de desarrollo

Trabaja de forma autónoma hasta completar una primera versión funcional.

No te limites a describir la solución ni a generar una maqueta. Implementa, prueba, documenta y deja la aplicación preparada para desplegar.

Toma decisiones técnicas razonables cuando falte detalle. Prioriza, en este orden:

1. Simplicidad de uso.
2. Fiabilidad de los datos.
3. Simplicidad técnica.
4. Mantenibilidad.
5. Diseño visual.

No amplíes el alcance con funcionalidades no solicitadas.

Cuando exista una decisión menor no definida, elige la opción más sencilla que permita evolucionar más adelante.

Antes de finalizar:

- Revisa el repositorio completo.
- Elimina código muerto y archivos temporales.
- Verifica que no hay secretos.
- Ejecuta las pruebas.
- Comprueba el flujo completo desde el registro hasta Google Sheets.
- Actualiza este README con las instrucciones reales de instalación y despliegue.

## Decisiones ya tomadas

- La primera versión requiere conexión a internet.
- El soporte offline se implementará más adelante.
- La aplicación será multiusuario.
- Cada evento registrará quién lo creó y quién lo modificó.
- Google Sheets será la fuente única de verdad.
- No se utilizará Supabase en la primera versión salvo que aparezca una limitación técnica insalvable y quede documentada.
- La prioridad es una aplicación pequeña, completa y utilizable, no una plataforma extensa.
