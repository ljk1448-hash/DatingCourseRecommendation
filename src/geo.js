// 위경도 기반 거리/시간 계산 유틸 (외부 API 없이 동작하는 규칙 기반 기본값)

const R = 6371; // 지구 반지름(km)

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

/** 두 좌표 사이 직선(하버사인) 거리 (km) */
export function haversineKm(a, b) {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * 실제 도보/도로 경로는 직선거리보다 길다. 보정계수를 곱해 체감 거리에 가깝게 만든다.
 * 카카오/네이버 길찾기 API 키가 연결되면 이 함수를 실거리로 교체할 수 있도록 분리해 둠.
 */
export function travelKm(a, b, detourFactor = 1.3) {
  return haversineKm(a, b) * detourFactor;
}

/** 도보 이동 예상 시간(분). 평균 보행 속도 4.5km/h 가정. */
export function walkMinutes(km) {
  return Math.round((km / 4.5) * 60);
}
