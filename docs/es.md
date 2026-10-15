# APC UPS Daemon

Siga sus SAI APC en Gladys gracias a **apcupsd**, el servicio que usan Unraid,
muchos NAS y servidores Linux para vigilar su SAI: cortes de luz, carga de la
batería, autonomía, carga, tensiones, una estimación de la potencia que
consumen sus equipos y de su energía. Las escenas pueden reaccionar a un corte
de luz, a la vuelta de la luz, a una batería baja y a una batería que hay que
sustituir.

> **Probada con hardware real: un SAI APC Smart-UPS SRT conectado por USB a un
> servidor Unraid con apcupsd 3.14.** También se ha probado con respuestas
> reales de apcupsd publicadas por otros proyectos. Si algo no cuadra con su
> modelo, abra una incidencia en GitHub con la salida de `apcaccess status`
> (oculte el número de serie).

Esta integración no está afiliada a APC ni a Schneider Electric.

## Requisitos

- Gladys Assistant 5.1.0 o posterior.
- Un SAI conectado (cable USB o serie) a un equipo donde se ejecuta
  **apcupsd**: servidor Linux, NAS, servidor Unraid, Raspberry Pi…
- El **servidor de información de red** (NIS) de apcupsd activado y a la
  escucha en la red, en el puerto 3551 (por defecto). Es el servicio de solo
  lectura que usan `apcaccess` y Home Assistant.

### apcupsd en Linux o Windows

En `apcupsd.conf` (normalmente `/etc/apcupsd/apcupsd.conf`), compruebe estas
tres líneas:

```
NETSERVER on
NISIP 0.0.0.0
NISPORT 3551
```

`NISIP 127.0.0.1` (el valor por defecto de algunas distribuciones) solo
responde al propio equipo: Gladys, en su contenedor, es rechazado. Reinicie
apcupsd después del cambio (`sudo systemctl restart apcupsd`) y compruebe desde
otro equipo que el puerto 3551 responde.

### Unraid

Unraid ejecuta apcupsd por sí mismo: abra **Settings → UPS Settings**, active
la opción del servidor de red («Enable network server») y aplique. Si la
integración sigue recibiendo «conexión rechazada», el servidor solo escucha en
el equipo Unraid: compruebe la línea `NISIP` de `/etc/apcupsd/apcupsd.conf` en
Unraid.

## Configuración

En Gladys, abra **Integraciones → APC UPS Daemon → Configuración**:

- **Servidores apcupsd**: la dirección IP del equipo donde se ejecuta apcupsd,
  seguida de `:puerto` si el puerto no es 3551. Un apcupsd atiende a un SAI:
  para varios SAI, introduzca varios servidores separados por comas, por
  ejemplo `192.0.2.10, 192.0.2.11:3552`. Prefiera las direcciones IP: los
  nombres `.local` no se resuelven dentro del contenedor de la integración.
- **Intervalo de actualización**: 5, 10 (por defecto), 30 segundos o 1 minuto.
  Un corte de luz se detecta dentro de este plazo.
- **Idioma de los textos de los dispositivos**: el idioma de los nombres de las
  funciones de los nuevos dispositivos y de los textos del SAI (estado, motivo
  de la última transferencia). Francés por defecto.

El botón **Comprobar los servidores** lee cada servidor e indica cuáles
responden, con su modelo, o por qué no responden.

Abra después la pestaña **Descubrir** y añada su SAI a Gladys.

## El dispositivo SAI

Cada SAI es un dispositivo. Una función solo existe si su SAI proporciona el
valor correspondiente (un Back-UPS no tiene temperatura interna, un Smart-UPS
antiguo no tiene potencia nominal). Todo es de solo lectura: el servidor de red
de apcupsd no puede enviar órdenes, y ningún botón apaga un SAI.

| Función                                                  | Lo que muestra                                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Estado                                                   | El estado en palabras: Con red eléctrica, Con batería, Batería baja, Sustituir la batería, Sobrecarga… |
| Red eléctrica                                            | Encendido (1) con red, Apagado (0) durante un corte: el valor para las condiciones de escena           |
| Batería baja                                             | Sí cuando el SAI indica batería baja: el apagado está cerca                                            |
| Carga de la batería                                      | Carga de la batería, en %                                                                              |
| Autonomía                                                | Autonomía restante con batería, en minutos, estimada por el SAI                                        |
| Carga                                                    | Carga del SAI, en % de su capacidad                                                                    |
| Potencia                                                 | Potencia que consumen sus equipos, en W, **estimada**: carga × potencia nominal                        |
| Energía                                                  | Energía acumulada, en kWh, calculada a partir de la potencia (véase más abajo)                         |
| Tensión de entrada / de salida / de la batería           | En voltios                                                                                             |
| Temperatura interna                                      | En °C                                                                                                  |
| Tiempo con batería / Tiempo total con batería            | Corte en curso, y desde el arranque de apcupsd, en segundos                                            |
| Número de transferencias                                 | Número de pasos a batería desde el arranque de apcupsd                                                 |
| Última transferencia / Motivo de la última transferencia | Fecha y motivo del último paso a batería (autotest, tensión de red demasiado baja…)                    |
| Fecha de la batería, Modelo, Número de serie             | Tal como los da el SAI                                                                                 |

### Seguimiento de energía

apcupsd da una carga en porcentaje, no un contador de energía. Cuando el SAI
indica su potencia nominal, la integración estima la potencia (carga ×
potencia nominal) y la acumula en el tiempo en un índice **Energía**, en kWh.
Gladys convierte este índice en un consumo cada 30 minutos y en su coste, como
con un enchufe inteligente: la pantalla **Energía** de Gladys muestra entonces
lo que consume su rincón de servidores. El índice se guarda en los datos de la
integración: nunca retrocede cuando la integración se reinicia. Es una
estimación: cuente con un pequeño porcentaje de error, y más con una carga muy
baja.

## Widget

El widget **SAI** muestra, para el SAI elegido en su configuración (el primero
añadido por defecto), el estado en palabras con un color (verde con red,
naranja con batería o batería que hay que sustituir, rojo con batería baja,
sobrecarga o un SAI que no responde), la última transferencia y mosaicos en
directo para la carga de la batería, la autonomía, la carga y la potencia
estimada.

## Disparadores de escena

Cuatro disparadores, en el editor de escenas bajo el nombre de la integración.
Cada uno puede vigilar un SAI, o cualquiera si el campo se deja vacío.

| Disparador                | Cuándo                               | Variables                                               |
| ------------------------- | ------------------------------------ | ------------------------------------------------------- |
| SAI: corte de luz         | el SAI pasa a batería                | nombre del SAI, carga de la batería, autonomía          |
| SAI: luz restablecida     | el SAI vuelve a la red tras un corte | nombre del SAI, carga de la batería, duración del corte |
| SAI: batería baja         | el SAI indica batería baja           | nombre del SAI, carga de la batería, autonomía          |
| SAI: sustituir la batería | el SAI pide una batería nueva        | nombre del SAI, fecha de la batería                     |

Un disparador se activa una vez por cambio, nunca en la primera lectura tras
un arranque. Un cambio ocurrido durante un reinicio de la integración también
lo activa, si el reinicio dura menos de 30 minutos.

## Ejemplos de escenas

### Avisarme de un corte de luz

Disparador **SAI: corte de luz**, acción **Enviar un mensaje**: «¡Corte de
luz! [Nombre del SAI] funciona con batería, queda un [Carga de la batería] %,
unos [Autonomía] minutos.» Las palabras entre corchetes son las variables del
disparador: escriba `{{` en el mensaje para insertarlas.

### Apagar lo superfluo durante un corte

Disparador **SAI: corte de luz**, acciones: apagar los enchufes de las
pantallas, de la impresora y de las luces que alimenta el SAI, para que la
batería dure más.

### Decirme cuándo vuelve la luz

Disparador **SAI: luz restablecida**, acción **Enviar un mensaje**: «La luz ha
vuelto tras [Duración del corte] segundos.»

## Solución de problemas

- **«conexión rechazada»**: el servidor de red de apcupsd está apagado, o solo
  escucha en el equipo de apcupsd (`NISIP 127.0.0.1`). Véanse los requisitos.
- **«sin respuesta»**: dirección o puerto incorrectos, o un cortafuegos entre
  Gladys y el equipo de apcupsd. El puerto 3551 debe estar abierto en TCP.
- **«nombre desconocido»**: introduzca la dirección IP en lugar del nombre.
- **El Estado indica «El SAI no responde»**: apcupsd responde, pero ha perdido
  el propio SAI (cable USB, controlador). Revise el equipo de apcupsd.
- **Ninguna función Potencia ni Energía**: su SAI no indica su potencia nominal
  (`NOMPOWER` en `apcaccess status`).
- **Registros**: la integración solo escribe su arranque, los servidores
  encontrados, los cortes y los errores. Ponga `LOG_LEVEL=debug` en el
  contenedor para ver cada lectura.

## Límites

- Un corte más corto que el intervalo de actualización puede pasar
  desapercibido (el contador de transferencias lo cuenta de todos modos).
- La potencia y la energía son estimaciones, no mediciones.
- El número de transferencias y los tiempos con batería vuelven a cero cuando
  apcupsd se reinicia.
- Solo lectura: ni autotest, ni apagado, ni cambio de ajustes desde Gladys.
- Probada con un SAI real (Smart-UPS SRT por USB) y con estados reales de apcupsd
  (Back-UPS ES 600, SMART-UPS 1400, un apcupsd 3.8 antiguo) y un servidor
  simulado.
- Para un SAI vigilado por NUT en lugar de apcupsd, use una integración NUT.
