# Enervent Pingvin Sniffer

Enervent Pingvin Sniffer is a passive Modbus RTU sniffer for Enervent (Pingvin) ventilation units.
The aim is to collect various temperature and moisture values to monitor the behavior of the ventilation unit.
The sniffer is intended to be run periodically (for example via a systemd timer), collecting fresh measurements without interfering with normal device operation.

It listens to the RS-485 bus between the Enervent controller and the ventilation unit, decodes selected register values, and publishes them as MQTT topics — making the data easily consumable by Home Assistant and other automation systems.

## Project Goals

* Integrate cleanly with Home Assistant using MQTT auto-discovery
* Keep deployment simple and transparent
* Stay passive and safe on the Modbus bus

## Quick Start

The assumption is that a Home Assistant instance is running, a MQTT proxy, and [MQTT integration](https://www.home-assistant.io/integrations/mqtt) have been configured for the Home Assistant instance. A good alternative is to use [Mosquito broker](http://homeassistant.local:8123/hassio/addon/core_mosquitto/documentation) as the proxy.

The sniffer can run on any unix/linux machine that has network access to MQTT proxy and has a USB/RS485 adapter connected parallel to Enervent Modbus.

The following installation and configuration steps are needed to get the sniffer running.

1. Clone and build this repository in the device that is supposed to run the sniffer.

* `git clone https://github.com/sofkaski/enervent-pingvin-sniffer.git`
* `cd enervent-pingvin-sniffer`
* `npm install`
* `npm run build`

1. Connect RS-485 sniffer

* Tap the RS-485 bus between the Pingvin controller and unit
* Connect the tap to a USB-RS485 adapter
* Verify the serial device (e.g. /dev/ttyUSB0)

⚠️ Do not add termination resistors on the sniffer adapter.

1. Configure MQTT & Modbus

Create or edit the configuration file with serial device & Modbus parameters, MQTT broker address, credentials, and
Base MQTT topic.

See example configuration in this README or repository.

1. Run once (test)

* export MQTT_SEND_DISCOVERY=true
* deploy/run-enervent-pingvin-sniffer.sh

If everything works:

* MQTT messages are published
* Home Assistant entities appear automatically

1. Install systemd timer (recommended)

For periodic execution, follow the instructions here:

📁 [deploy/systemd/README.md](deploy/systemd/README.md)

This installs:

* a systemd service

* a systemd timer

optional auto-discovery via environment variables


🧠 Design Philosophy

* Passive by design — no Modbus master behavior
* Stateless execution — intended for periodic sampling
* Home-automation friendly — MQTT as primary output
