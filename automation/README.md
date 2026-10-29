# 블루캣 Meta 자동화

Meta 공식 Graph API를 직접 호출하는 스크립트 모음이다. 의존성 없이 Node 20 이상에서 동작한다.
이 저장소는 공개 저장소이므로 토큰, 계정 ID 등 실제 값은 절대 커밋하지 않는다. `.env`는 `.gitignore`에 포함되어 있다.

## 구성

| 파일 | 역할 | 쓰기 여부 |
|---|---|---|
| `ads-insights.js` | 광고 성과 조회, JSON/CSV 저장 | 읽기 전용 (`ads_read`) |
| `ig-publish.js` | 인스타그램 이미지 게시 | 쓰기 (기본은 드라이런) |
| `lib/graph.js` | Graph API 클라이언트 | - |

## 사전 준비 (사용자 작업)

1. Meta 개발자 앱 생성, 인스타그램 프로페셔널 계정을 페이스북 페이지에 연결한다.
2. 시스템 사용자 또는 장기 토큰을 발급한다. 권한: `ads_read`, `instagram_basic`, `instagram_content_publish`, `pages_show_list`.
3. 광고 계정 ID(광고 관리자 주소의 `act=` 뒤 숫자)와 인스타그램 비즈니스 계정 ID를 확인한다.
4. `.env.example`을 참고해 호스팅 환경의 시크릿 또는 로컬 `.env`에 값을 넣는다.

## 사용

```bash
cd automation
npm test

# 성과 조회 (읽기 전용)
node --env-file=.env ads-insights.js --level campaign --preset last_7d
node --env-file=.env ads-insights.js --since 2026-10-01 --until 2026-10-07

# 게시: 드라이런(기본). 검증만 하고 네트워크 호출은 하지 않는다
node ig-publish.js --image-url https://cdn.example.com/post.jpg --caption-file caption.txt
# 실제 게시
node --env-file=.env ig-publish.js --image-url https://cdn.example.com/post.jpg --caption-file caption.txt --publish
```

## 설계 원칙

- 조회(GET)만 일시 오류에서 재시도한다. 게시(POST)는 응답이 유실된 채 실제로는 게시되었을 때 중복 게시가 되므로 재시도하지 않는다.
- 게시 전 `content_publishing_limit`로 24시간 한도를 확인하고, 컨테이너가 `FINISHED`가 된 뒤에만 `media_publish`를 호출한다.
- 오류 메시지에서 토큰을 가린다. 토큰은 로그에 출력하지 않는다.
- Graph API 버전은 `GRAPH_API_VERSION`으로 바꾼다. 기본값은 `v25.0`이다.

## 알려진 한계와 미검증 사항

- 실제 Meta 서버를 대상으로 한 호출은 검증하지 못했다. 테스트는 모의 응답 기준이다. 토큰 발급 후 첫 실행은 드라이런과 읽기 전용 조회부터 한다.
- 이미지는 공개 https URL이어야 하고 JPEG만 지원된다. 이미지 호스팅(R2, S3 등)은 아직 구현하지 않았다.
- 성과 조회의 `reach` 등 일부 지표는 Meta의 지표 체계 개편 영향을 받을 수 있다. 오류가 나면 `--fields`로 조정한다. 개편 범위는 확인하지 못했다.
- 캠페인 생성, 수정, 예산 변경은 구현하지 않았다. 예산이 걸린 쓰기 작업이라 승인 절차를 먼저 설계한 뒤 추가한다.
