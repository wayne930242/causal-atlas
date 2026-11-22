FROM rocker/r-ver:4.5.2@sha256:fd4ccdd3a4a6f7ef805e2daeee2a0fe3bf126bc231f36351223baecf5a595a4c

RUN Rscript --vanilla -e 'options(warn = 2, repos = c(CRAN = "https://cloud.r-project.org")); install.packages(c("cli", "cpp11", "glue", "lifecycle", "magrittr", "pkgconfig", "rlang", "vctrs"), Ncpus = 4); pinned <- c(Rcpp = "1.1.2", jsonlite = "2.0.0", igraph = "2.3.4", dosearch = "1.0.12", causaleffect = "1.3.15"); for (pkg in names(pinned)) { tarball <- paste0(pkg, "_", pinned[[pkg]], ".tar.gz"); url <- paste0("https://cloud.r-project.org/src/contrib/", tarball); path <- tempfile(fileext = ".tar.gz"); tryCatch(download.file(url, path, quiet = TRUE), error = function(e) download.file(paste0("https://cloud.r-project.org/src/contrib/Archive/", pkg, "/", tarball), path, quiet = TRUE)); install.packages(path, repos = NULL, type = "source"); stopifnot(packageVersion(pkg) == pinned[[pkg]]); unlink(path) }'
WORKDIR /oracle
ENTRYPOINT ["Rscript", "--vanilla", "/oracle/run-oracles.R"]
