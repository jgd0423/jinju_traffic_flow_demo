/*
 * https://deck.gl/docs/api-reference/geo-layers/trips-layer
 */

/*
 *   TripsLayer : TripsLayer를 그리기위해 필요한 클래스
 *   MapView : Deck.gl에서 사용되는 지도 뷰를 나타내는 클래스
 */

$gis = {
    ui: {
        vehicleMovementFlowUI: {
            firstLoop : true,
            isLayerOn: false,
            layer: undefined,
            animationFrameObj: undefined,
        }
    }
}
const { TripsLayer, MapView } = deck;
// deck.gl과 Leaflet을 통합하여 지도와 지리 데이터 시각화를 함께 사용하게 해주는 클래스
const { LeafletLayer } = DeckGlLeaflet;

// 지도 생성
const mapElement = document.querySelector("#map");
const midnightTileUrl = 'https://api.vworld.kr/req/wmts/1.0.0/EE7A79A3-3374-3C16-9C06-4E299C380CA8/midnight/{z}/{y}/{x}.png';
const tileOptions = {
    maxZoom: 18,
    minZoom: 1,
};
const midnightTileLayer = new L.TileLayer(midnightTileUrl, tileOptions);
const map = L.map(mapElement, {
    center: [35.1803062, 128.1087476],
    zoom: 14,
});

midnightTileLayer.addTo(map);



document.querySelector('#all_trips').onclick = function() {
    removeLayer();
    drawLayer(getTripsForTest(), 0.03, true);
};

document.querySelector('#one_trip_animation').onclick = function() {
    removeLayer();
    drawLayer(single_trip, 1, true);
};

document.querySelector('#one_trip').onclick = function() {
    removeLayer();
    drawLayer(single_trip, 1, false, 80);
};


function getTripsForTest() {
    function getRandomLinkId(dataset) {
        const linkIds = dataset.features.map(feature => feature.properties.LINK_ID);
        const randomIndex = Math.floor(Math.random() * linkIds.length);
        return linkIds[randomIndex];
    }
    
    function generateRandomCarTrip(dataset, totalCars) {
        const randomCarIds = new Map();
        for (let i = 1; i <= totalCars; i++) {
            const carId = `Car_${i}`;
            const linkId = getRandomLinkId(dataset);
            randomCarIds.set(carId, { connectedLinks: [ linkId ] });
        }
        return randomCarIds;
    }
    
    const totalCars = 10000;
    const carTripMap = generateRandomCarTrip(jinjuRoadsGeojson, totalCars);
    
    const linkIdMap = new Map();
    const beginNodeIdMap = new Map();
    
    jinjuRoadsGeojson.features.forEach((feature) => {
        const { LINK_ID, BEGIN_NODE_ID } = feature.properties;
    
        // LINK_ID Map
        if (linkIdMap.has(LINK_ID)) {
            const existingValue = linkIdMap.get(LINK_ID);
            if (Array.isArray(existingValue)) {
                existingValue.push(feature);
                linkIdMap.set(LINK_ID, existingValue);
            } else {
                linkIdMap.set(LINK_ID, [existingValue, feature]);
            }
        } else {
            linkIdMap.set(LINK_ID, feature);
        }
    
        // BEGIN_NODE_ID Map
        if (beginNodeIdMap.has(BEGIN_NODE_ID)) {
            const existingValue = beginNodeIdMap.get(BEGIN_NODE_ID);
            if (Array.isArray(existingValue)) {
                existingValue.push(feature);
                beginNodeIdMap.set(BEGIN_NODE_ID, existingValue);
            } else {
                beginNodeIdMap.set(BEGIN_NODE_ID, [existingValue, feature]);
            }
        } else {
            beginNodeIdMap.set(BEGIN_NODE_ID, feature);
        }
    });
    
    function getRandomElementFromArray(arr) {
        const randomIndex = Math.floor(Math.random() * arr.length);
        return arr[randomIndex];
    }
    
    function getConnectedLinkId(willConnectedLinkId) {
        if (willConnectedLinkId.length === 10) {
            return willConnectedLinkId;
        }
        const lastLinkId = willConnectedLinkId[willConnectedLinkId.length - 1];
        const linkInfo = linkIdMap.get(lastLinkId);
        const endNodeId = linkInfo.properties.END_NODE_ID;
        const nextLinks = beginNodeIdMap.get(endNodeId) ?? [];
        const nextLink = getRandomElementFromArray(nextLinks);
        if (nextLink) {
            willConnectedLinkId.push(nextLink.properties.LINK_ID);
        }
        if (!nextLink) {
            return willConnectedLinkId;
        }
        return getConnectedLinkId(willConnectedLinkId);
    }
    
    carTripMap.forEach((car) => {
        const willConnectLinks = [...car.connectedLinks];
        car.connectedLinks = getConnectedLinkId(willConnectLinks);
    });
    
    carTripMap.forEach((car) => {
        const connectedLinestring = [];
        car.connectedLinks.forEach((linkId) => {
            const linkInfo = linkIdMap.get(linkId);
            linkInfo.geometry.coordinates.forEach((point, idx) => {
                if (idx === 0 
                    && connectedLinestring.length > 0 
                    && connectedLinestring[connectedLinestring.length - 1][0] !== point[0]
                    && connectedLinestring[connectedLinestring.length - 1][1] !== point[1]) {
                        connectedLinestring.push(point);
                        return;
                    }
                    connectedLinestring.push(point);
            });
        });
        car.connectedLinestring = connectedLinestring;
        // 길이로 분할하기?
        car.roadMeter = Math.round(turf.length(turf.lineString(connectedLinestring)) * 1000);
        car.linkPoints = connectedLinestring.length;
    });
    
    const trips = [];
    carTripMap.forEach((car) => {
        // if (trips.length === 1) return;
        const roadMeter = car.roadMeter;
        
        let carTimestamp = 0;
        const trip = {
            vendor: 0,
            path: [],
            timestamps: [],
        };
        car.connectedLinestring.forEach((thisPoint, i) => {
            trip.path.push(thisPoint);
            trip.timestamps.push(carTimestamp / 10);
            const nextPoint = car.connectedLinestring[i + 1];
            if (nextPoint) {
                const lineString = turf.lineString([thisPoint, nextPoint]);
                const pointDistance = Math.round(turf.length(lineString) * 1000);
                const distancePercent = Math.round(pointDistance / roadMeter * 10000);
                carTimestamp += distancePercent;
            }
        });

        trips.push(trip);
    });
    return trips;
};

function drawLayer(tripList, opacity, isAni, currentTime) {
    const { TripsLayer } = deck;
    const { LeafletLayer } = DeckGlLeaflet;
    const LOOP_LENGTH = 1000;
    let tripsLayerTime = 0;
    if (currentTime) {
        tripsLayerTime = currentTime;
    }
    const VENDOR_COLORS = [
        [255, 0, 0],
    ];
    
    let props = {
        id: "TripsLayer",
        data: tripList,
        currentTime: tripsLayerTime,
        getTimestamps: (d) => d.timestamps,
        getPath: (d) => d.path,
        getColor: (d) => VENDOR_COLORS[d.vendor],
        trailLength: 70,
        widthMinPixels: 5,
        widthMaxPixels: 5,
        opacity: opacity,
    };
    
    const deckLayer = new LeafletLayer({
        layers: [
            new TripsLayer({
                ...props,
            }),
        ],
    });

    $gis.ui.vehicleMovementFlowUI.layer = deckLayer;
    map.addLayer(deckLayer);
    if (isAni) {
        const animate = () => {
            tripsLayerTime = (tripsLayerTime + 1) % LOOP_LENGTH;
            props["currentTime"] = tripsLayerTime;
            const layer = new TripsLayer({
                ...props,
            });
            $gis.ui.vehicleMovementFlowUI.layer.setProps({ layers: layer });
            $gis.ui.vehicleMovementFlowUI.animationFrameObj = requestAnimationFrame(animate);
        };
        $gis.ui.vehicleMovementFlowUI.animationFrameObj = requestAnimationFrame(animate);
    }

    $gis.ui.vehicleMovementFlowUI.isLayerOn = true;
};

function removeLayer() {
    const vehicleMovementFlowUI = $gis.ui.vehicleMovementFlowUI;
    cancelAnimationFrame(vehicleMovementFlowUI.animationFrameObj);
    vehicleMovementFlowUI.animationFrameObj = undefined;
    if (vehicleMovementFlowUI.layer) {
        map.removeLayer(vehicleMovementFlowUI.layer);
    }
    vehicleMovementFlowUI.layer = undefined;
    vehicleMovementFlowUI.isLayerOn = false;
}