# Contributing

Thank you for your interest in contributing this project! We appreciate your help in making this project better.

Here's a quick guide to get you started:

## Reporting Issues

If you find a bug or have a suggestion for improvement, please open a new issue. When creating an issue, please:

* Use one of the available templates.
* Use a clear and descriptive title.
* Provide as much detail as possible to help us understand and reproduce the issue.
* If it's a bug report, include steps to reproduce, expected behavior, and actual behavior.

## Contributing Code

We welcome contributions in the form of merge requests. We use a simplified Git Flow. 
All development happens on feature branches branched off the `main` branch. Once a feature is complete and reviewed, it is merged back into `main`.

For internal contributors, create a new Merge Request from an existing issue:

1. Navigate to the issue you want to work on in GitLab.
2. On the right sidebar of the issue page, you should see a section with buttons. Click the button labeled **"Create merge request"** (or similar, depending on your GitLab version).
3. This will automatically create a new branch for you, often named with the issue number and a short description (e.g., `123-fix-typo`). This branch is based on the repository's default branch (`main`).

For external contributor, follow the steps above and aditionally:

1.  Fork the repository.
2.  Create a new branch for your changes: `git checkout -b your-feature-branch`
3.  Make your changes and commit them: `git commit -m "Your descriptive commit message"`
4.  Push your changes to your fork: `git push origin your-feature-branch`
5.  Open a new merge request against the `main` (or `master`) branch of the original repository.

Please ensure your code follows the existing code style and includes relevant tests if applicable.

## Code Contribution Guidelines

Please follow these guidelines when contributing code:

* **Coding Style:** Please ensure your code is clean and readable, look arround and imitate the existing coding style. The basic style is snake_case, identations are 4 spaces, and Allman identation style.
* **Linters and Formatters:** Use clang-format and the provided `.clang-format` style file to reformat your code.
* **Testing:** All new features and bug fixes should include relevant tests.
* **Documentation:** If your changes introduce new features or modify existing ones, please update the documentation accordingly. Our documentation is written in Doxygen style.


Thank you again for your contributions!