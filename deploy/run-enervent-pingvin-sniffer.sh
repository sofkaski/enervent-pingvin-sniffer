#!/usr/bin/env bash
set -euo pipefail

# Convenience runner for enervent-pingvin-sniffer
# Usage:
#   ./deploy/run-enervent-pingvin-sniffer.sh
# Or override env vars inline:
#   REGISTER_MAP_PATH=/etc/enervent/register-map.yaml SNIFFER_ARGS="--silent --func 16 --slave 0" ./deploy/run-enervent-pingvin-sniffer.sh

# Defaults - override using environment variables
: "${WORKING_DIR:=$(pwd)}"
: "${NODE_ENV:=production}"
: "${LOG_LEVEL:=info}"
: "${REGISTER_MAP_PATH:=$WORKING_DIR/config/register-map.yaml}"
: "${SNIFFER_ARGS:=-p /dev/ttyUSB0 -s 19200 -l -t 1500 --silent --func 16 --slave 0}"
: "${MQTT_URL:=mqtt://localhost:1883}"
: "${MQTT_USERNAME:=undefined}"
: "${MQTT_PASSWORD:=undefined}"
: "${CAPTURE_TIMEOUT_MS:=60000}"
: "${MODBUS_ADDRESS_BASE:=0}"
: "${MODBUS_CONVENTIONAL_BASE:=0}"

export NODE_ENV
export REGISTER_MAP_PATH
export SNIFFER_ARGS
export MQTT_URL
export MQTT_USERNAME
export MQTT_PASSWORD
export CAPTURE_TIMEOUT_MS
export LOG_LEVEL
export MODBUS_ADDRESS_BASE
export MODBUS_CONVENTIONAL_BASE


echo "Starting enervent-pingvin-sniffer"
echo "  Working dir: $WORKING_DIR"
echo "  REGISTER_MAP_PATH: $REGISTER_MAP_PATH"
echo "  SNIFFER_ARGS: $SNIFFER_ARGS"
echo "  MQTT_URL: $MQTT_URL"
echo "  CAPTURE_TIMEOUT_MS: $CAPTURE_TIMEOUT_MS"

# Run via npm start (build + node) so behaviour matches service
exec env NODE_ENV="$NODE_ENV" \
          REGISTER_MAP_PATH="$REGISTER_MAP_PATH" \
          SNIFFER_ARGS="$SNIFFER_ARGS" \
          MQTT_URL="$MQTT_URL" \
          CAPTURE_TIMEOUT_MS="$CAPTURE_TIMEOUT_MS" \
          LOG_LEVEL="$LOG_LEVEL" \
          MODBUS_ADDRESS_BASE="$MODBUS_ADDRESS_BASE" \
          MODBUS_CONVENTIONAL_BASE="$MODBUS_CONVENTIONAL_BASE" \
          npm run start
