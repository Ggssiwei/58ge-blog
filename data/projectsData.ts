interface Project {
  title: string
  description: string
  href?: string
  imgSrc?: string
}

const projectsData: Project[] = [
  {
    title: '58ge Blog',
    description: `A blog website for myself`,
    imgSrc: '/static/images/58ge-blog.png',
    href: 'https://blog.58ge.gs.cn',
  },
  {
    title: 'Element Transform',
    description: `A Chrome / Edge browser extension to transform web elements.`,
    imgSrc: '/static/images/element-transform.png',
    href: 'https://github.com/Ggssiwei/element-transform',
  },
]

export default projectsData
