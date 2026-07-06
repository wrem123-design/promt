# 프롬프트 아카이브

이미지를 업로드하면 브라우저에서 먼저 압축하고, 서버가 이미지 파일과 앱 상태를 저장하는 앨범형 프롬프트 저장소입니다.

## 실행

Windows에서 `run-server.bat`를 실행합니다.

기본 주소:

```text
http://127.0.0.1:5173
```

관리자 MVP 비밀번호:

```text
archive-admin
```

## 저장 방식

- 앱 상태: `data/state.json`
- 업로드 이미지: `uploads/`
- 브라우저 저장소는 서버가 없을 때만 임시 fallback으로 사용합니다.

## 주의

현재 AI 분석은 MVP mock 분석입니다. 실제 AI 호출과 API Key 암호화 저장은 서버 API로 추가해야 합니다.
