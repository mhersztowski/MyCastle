

cd src/desktop && pip install -r requirements.txt
python agent.py - agent powinien polaczyc sie z MQTT i wypisac liste operacji
Test z dowolnego MQTT clienta: opublikowac na mycastle/desktop/request pakiet z action: "system_info" i sprawdzic odpowiedz na mycastle/desktop/response