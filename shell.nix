with import <nixpkgs> { };

mkShell {
  nativeBuildInputs = [
    direnv
    nodejs
  ];

  NIX_ENFORCE_PURITY = true;

  shellHook = ''
  '';
}
