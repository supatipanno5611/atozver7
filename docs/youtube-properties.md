# 유튜브 속성 삽입

## 역할

현재 파일의 frontmatter에 YouTube 영상 식별자 `youtubeId`를 저장합니다.

## 사용 방법

- 명령 팔레트에서 `유튜브 속성 삽입`을 실행합니다.
- YouTube 동영상 URL 또는 영상 ID를 입력합니다.

## 지원 입력

- `youtube.com/watch?v=...` 링크
- `youtube.com/embed/...` 또는 `youtube.com/shorts/...` 링크
- `youtu.be/...` 링크
- 영문자, 숫자, `_`, `-`로 구성된 영상 ID

## 제약

- 활성 파일이 있어야 합니다.
- 올바른 링크나 ID로 해석할 수 없으면 속성을 저장하지 않습니다.

## 참고

- 이 기능은 [블로그 템플릿](https://github.com/supatipanno5611/vercel-blog-template)을 활용하기 위해 만들어졌습니다.