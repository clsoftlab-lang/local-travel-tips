// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 CLSOFTLAB (씨엘소프트랩), Dr. Lee Il-guk (이일국)
//
// AI 레이어 설정.
//
// AI_ENDPOINT 가 빈 문자열이면(기본값) 앱은 백엔드 없이 결정적(deterministic)
// 한국어 MockProvider 로 동작합니다. 이때 API 키는 전혀 필요하지 않습니다.
//
// 실제 Claude 연동을 켜려면 server/ 백엔드 프록시를 띄운 뒤, 그 주소를 여기에
// 적으세요. 예: "http://localhost:8790/api/ai"
//
// ⚠️ 절대 브라우저/리포지토리에 API 키를 두지 마세요.
//    키는 오직 server/ 백엔드에서 환경변수(ANTHROPIC_API_KEY)로만 사용합니다.
export const AI_ENDPOINT = "";
